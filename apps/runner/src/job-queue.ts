import type { RunnerJob, RunnerJobType } from "@ai-coding-agent/shared";
import { createId } from "./ids";
import { type RunnerStore, upsertJob } from "./store";

export type JobProcessor = (job: RunnerJob) => Promise<void>;
export type ProcessJobOptions = {
  now?: () => Date;
  retryBackoffMs?: number;
};

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_BACKOFF_MS = 1000;

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isInteger(value) && value > 0 ? value : fallback;
}

function getNow(options: ProcessJobOptions): Date {
  return options.now?.() ?? new Date();
}

function getRetryDelayMs(attempts: number, options: ProcessJobOptions): number {
  const baseBackoffMs = normalizePositiveInteger(options.retryBackoffMs, DEFAULT_RETRY_BACKOFF_MS);
  return baseBackoffMs * Math.max(1, 2 ** Math.max(0, attempts - 1));
}

function getRunnableAt(job: RunnerJob): Date {
  return job.nextRunAt ?? job.createdAt;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Job failed.";
}

export function enqueueJob(store: RunnerStore, input: {
  taskId?: string;
  type: RunnerJobType;
  payload: Record<string, unknown>;
  maxAttempts?: number;
}): RunnerJob {
  const job: RunnerJob = {
    id: createId("job"),
    taskId: input.taskId,
    type: input.type,
    status: "QUEUED",
    payload: input.payload,
    attempts: 0,
    maxAttempts: normalizePositiveInteger(input.maxAttempts, DEFAULT_MAX_ATTEMPTS),
    createdAt: new Date()
  };
  upsertJob(store, job);
  return job;
}

export function listJobs(store: RunnerStore): RunnerJob[] {
  return [...store.jobs.values()].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

function findNextRunnableJob(store: RunnerStore, now: Date): RunnerJob | undefined {
  return listJobs(store)
    .filter((item) => item.status === "QUEUED" && getRunnableAt(item).getTime() <= now.getTime())
    .sort((a, b) => getRunnableAt(a).getTime() - getRunnableAt(b).getTime())[0];
}

export async function processNextJob(
  store: RunnerStore,
  processor: JobProcessor,
  options: ProcessJobOptions = {}
): Promise<RunnerJob | undefined> {
  const job = findNextRunnableJob(store, getNow(options));
  if (!job) {
    return undefined;
  }

  const { completedAt: _completedAt, error: _error, nextRunAt: _nextRunAt, ...pendingJob } = job;
  const running: RunnerJob = {
    ...pendingJob,
    attempts: job.attempts + 1,
    maxAttempts: normalizePositiveInteger(job.maxAttempts, DEFAULT_MAX_ATTEMPTS),
    status: "RUNNING",
    startedAt: getNow(options)
  };
  upsertJob(store, running);

  try {
    await processor(running);
    const completed: RunnerJob = {
      ...running,
      status: "COMPLETED",
      completedAt: getNow(options)
    };
    upsertJob(store, completed);
    return completed;
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    if (running.attempts < running.maxAttempts) {
      const retryAt = getNow(options);
      const queued: RunnerJob = {
        ...running,
        status: "QUEUED",
        error: errorMessage,
        nextRunAt: new Date(retryAt.getTime() + getRetryDelayMs(running.attempts, options))
      };
      upsertJob(store, queued);
      return queued;
    }

    const failed: RunnerJob = {
      ...running,
      status: "FAILED",
      error: errorMessage,
      completedAt: getNow(options)
    };
    upsertJob(store, failed);
    return failed;
  }
}
