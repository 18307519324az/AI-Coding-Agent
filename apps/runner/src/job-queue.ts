import type { RunnerJob, RunnerJobType } from "@ai-coding-agent/shared";
import { createId } from "./ids";
import { type RunnerStore, upsertJob } from "./store";

export type JobProcessor = (job: RunnerJob) => Promise<void>;

export function enqueueJob(store: RunnerStore, input: {
  taskId?: string;
  type: RunnerJobType;
  payload: Record<string, unknown>;
}): RunnerJob {
  const job: RunnerJob = {
    id: createId("job"),
    taskId: input.taskId,
    type: input.type,
    status: "QUEUED",
    payload: input.payload,
    createdAt: new Date()
  };
  upsertJob(store, job);
  return job;
}

export function listJobs(store: RunnerStore): RunnerJob[] {
  return [...store.jobs.values()].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

export async function processNextJob(store: RunnerStore, processor: JobProcessor): Promise<RunnerJob | undefined> {
  const job = listJobs(store).find((item) => item.status === "QUEUED");
  if (!job) {
    return undefined;
  }

  const running: RunnerJob = {
    ...job,
    status: "RUNNING",
    startedAt: new Date()
  };
  upsertJob(store, running);

  try {
    await processor(running);
    const completed: RunnerJob = {
      ...running,
      status: "COMPLETED",
      completedAt: new Date()
    };
    upsertJob(store, completed);
    return completed;
  } catch (error) {
    const failed: RunnerJob = {
      ...running,
      status: "FAILED",
      error: error instanceof Error ? error.message : "Job failed.",
      completedAt: new Date()
    };
    upsertJob(store, failed);
    return failed;
  }
}
