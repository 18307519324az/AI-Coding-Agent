import { CreateTaskRequestSchema, type ResolvedCreateTaskRequest, type RunnerJob } from "@ai-coding-agent/shared";
import { processNextJob } from "./job-queue";
import {
  generateTaskPlanFlow,
  type PlanGenerator,
  type ProjectAnalyzer,
  type RepositoryCloner
} from "./mock-flow";
import type { RunnerStore } from "./store";

export type RunnerJobProcessorOptions = {
  workspaceExecution?: boolean;
  retryBackoffMs?: number;
  repositoryCloner?: RepositoryCloner;
  projectAnalyzer?: ProjectAnalyzer;
  planGenerator?: PlanGenerator;
};

function parseQueuedPlanJob(job: RunnerJob): {
  taskId: string;
  request: ResolvedCreateTaskRequest;
} {
  const taskId = job.payload.taskId;
  const request = job.payload.request;
  if (typeof taskId !== "string") {
    throw new Error("Queued plan job is missing taskId.");
  }

  const parsed = CreateTaskRequestSchema.safeParse(request);
  if (!parsed.success || !parsed.data.title || !parsed.data.prompt) {
    throw new Error("Queued plan job payload is invalid.");
  }

  return {
    taskId,
    request: parsed.data as ResolvedCreateTaskRequest
  };
}

export async function processRunnerJob(
  store: RunnerStore,
  job: RunnerJob,
  options: RunnerJobProcessorOptions = {}
): Promise<void> {
  if (job.type !== "PLAN_TASK") {
    throw new Error(`Unsupported job type: ${job.type}`);
  }

  const { taskId, request } = parseQueuedPlanJob(job);
  const task = store.tasks.get(taskId);
  if (!task) {
    throw new Error(`Task not found for job ${job.id}.`);
  }

  const plannedTask = await generateTaskPlanFlow(store, task, request, {
    workspaceExecution: options.workspaceExecution,
    repositoryCloner: options.repositoryCloner,
    projectAnalyzer: options.projectAnalyzer,
    planGenerator: options.planGenerator
  });

  if (plannedTask.status.startsWith("FAILED")) {
    throw new Error(`Task plan job ended with ${plannedTask.status}.`);
  }
}

export async function processNextRunnerJob(
  store: RunnerStore,
  options: RunnerJobProcessorOptions = {}
): Promise<RunnerJob | undefined> {
  return processNextJob(store, async (job) => {
    await processRunnerJob(store, job, options);
  }, {
    retryBackoffMs: options.retryBackoffMs
  });
}
