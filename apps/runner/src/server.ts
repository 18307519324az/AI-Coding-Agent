import cors from "@fastify/cors";
import {
  ConnectRepositoryRequestSchema,
  CreatePrRequestSchema,
  CreateTaskRequestSchema,
  RejectApprovalRequestSchema
} from "@ai-coding-agent/shared";
import type { Approval } from "@ai-coding-agent/shared";
import Fastify from "fastify";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { parseGitHubRepositoryUrl } from "@ai-coding-agent/agent-core";
import { createId } from "./ids";
import { processNextRunnerJob, type RunnerJobProcessorOptions } from "./job-processor";
import { enqueueJob, listJobs } from "./job-queue";
import { createRunLog, createTraceEvent } from "./log";
import { resolveCreateTaskRequest, type IssueFetcher } from "./issue-service";
import {
  approvePlanFlow,
  approvePrFlow,
  createTaskRecord,
  createTaskFlow,
  type BranchPublisher,
  type CommandRunner,
  type ImplementationGenerator,
  type PlanGenerator,
  type ProjectAnalyzer,
  type PullRequestCreator,
  type RepositoryCloner
} from "./mock-flow";
import { appendLog, appendTrace, createStore, listTaskApprovals, persistStore, upsertApproval, type RunnerStore } from "./store";
import { getWorkspaceRoot } from "./workspace";
import { cleanupTaskWorkspaces, type WorkspaceCleanupOptions } from "./workspace-cleanup";

const ParamsSchema = z.object({
  taskId: z.string()
});

const ApprovalParamsSchema = ParamsSchema.extend({
  approvalId: z.string()
});

export type ServerOptions = {
  issueFetcher?: IssueFetcher;
  apiKey?: string;
  jobMode?: "inline" | "queued";
  jobMaxAttempts?: number;
  jobRetryBackoffMs?: number;
  workspaceRoot?: string;
  workspaceRetentionMs?: number;
  workspaceExecution?: boolean;
  repositoryCloner?: RepositoryCloner;
  projectAnalyzer?: ProjectAnalyzer;
  planGenerator?: PlanGenerator;
  implementationGenerator?: ImplementationGenerator;
  commandRunner?: CommandRunner;
  e2eArtifactRoot?: string;
  branchPublisher?: BranchPublisher;
  pullRequestCreator?: PullRequestCreator;
};

export function shouldUseWorkspaceExecution(options: ServerOptions): boolean {
  return options.workspaceExecution ??
    Boolean(
      options.repositoryCloner ||
      options.projectAnalyzer ||
      options.commandRunner ||
      process.env.RUNNER_EXECUTION_MODE === "workspace"
    );
}

export function shouldUseQueuedJobs(options: ServerOptions): boolean {
  return options.jobMode === "queued" || process.env.RUNNER_JOB_MODE === "queued";
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getRunnerJobMaxAttempts(options: ServerOptions): number {
  return options.jobMaxAttempts ?? parsePositiveInteger(process.env.RUNNER_JOB_MAX_ATTEMPTS, 3);
}

export function getRunnerJobRetryBackoffMs(options: ServerOptions): number {
  return options.jobRetryBackoffMs ?? parsePositiveInteger(process.env.RUNNER_JOB_RETRY_BACKOFF_MS, 1000);
}

export function createRunnerJobProcessorOptions(options: ServerOptions): RunnerJobProcessorOptions {
  return {
    workspaceExecution: shouldUseWorkspaceExecution(options),
    retryBackoffMs: getRunnerJobRetryBackoffMs(options),
    repositoryCloner: options.repositoryCloner,
    projectAnalyzer: options.projectAnalyzer,
    planGenerator: options.planGenerator
  };
}

export function createWorkspaceCleanupOptions(options: ServerOptions): WorkspaceCleanupOptions {
  return {
    workspaceRoot: options.workspaceRoot ?? getWorkspaceRoot(),
    retentionMs: options.workspaceRetentionMs ?? 7 * 24 * 60 * 60 * 1000
  };
}

function getRunnerApiKey(options: ServerOptions): string | undefined {
  return options.apiKey ?? process.env.RUNNER_API_KEY;
}

function getBearerToken(value: string | undefined): string | undefined {
  const prefix = "Bearer ";
  return value?.startsWith(prefix) ? value.slice(prefix.length) : undefined;
}

function isMatchingSecret(actual: string | undefined, expected: string): boolean {
  if (!actual) {
    return false;
  }

  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function createServer(store: RunnerStore = createStore(), options: ServerOptions = {}) {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      redact: ["req.headers.authorization"]
    }
  });

  app.register(cors, {
    origin: true
  });

  app.addHook("onRequest", async (request, reply) => {
    const apiKey = getRunnerApiKey(options);
    const path = request.url.split("?")[0];
    if (!apiKey || path === "/health" || request.method === "OPTIONS") {
      return;
    }

    const token = getBearerToken(request.headers.authorization);
    if (!isMatchingSecret(token, apiKey)) {
      return reply.status(401).send({ error: "Unauthorized." });
    }
  });

  app.get("/health", async () => ({
    ok: true,
    service: "runner"
  }));

  app.post("/api/tasks", async (request, reply) => {
    const parsed = CreateTaskRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid task request.", details: parsed.error.flatten() });
    }

    try {
      const resolvedRequest = await resolveCreateTaskRequest(parsed.data, options.issueFetcher);
      const workspaceExecution = shouldUseWorkspaceExecution(options);
      if (shouldUseQueuedJobs(options)) {
        const task = createTaskRecord(store, resolvedRequest);
        const job = enqueueJob(store, {
          taskId: task.id,
          type: "PLAN_TASK",
          maxAttempts: getRunnerJobMaxAttempts(options),
          payload: {
            taskId: task.id,
            request: resolvedRequest
          }
        });
        appendLog(store, createRunLog({
          taskId: task.id,
          level: "info",
          phase: "CREATED",
          message: `Plan generation queued as ${job.id}.`
        }));
        return reply.status(202).send({ taskId: task.id, status: task.status, jobId: job.id });
      }

      const task = await createTaskFlow(store, resolvedRequest, {
        workspaceExecution,
        repositoryCloner: options.repositoryCloner,
        projectAnalyzer: options.projectAnalyzer,
        planGenerator: options.planGenerator
      });
      return reply.status(201).send({ taskId: task.id, status: task.status });
    } catch (error) {
      return reply.status(400).send({
        error: error instanceof Error ? error.message : "Failed to create task."
      });
    }
  });

  app.get("/api/jobs", async () => ({
    jobs: listJobs(store)
  }));

  app.post("/api/workspaces/cleanup", async () => cleanupTaskWorkspaces(store, createWorkspaceCleanupOptions(options)));

  app.post("/api/jobs/process-next", async (request, reply) => {
    const job = await processNextRunnerJob(store, createRunnerJobProcessorOptions(options));

    if (!job) {
      return reply.status(204).send();
    }

    return job;
  });

  app.get("/api/tasks", async () => ({
    tasks: [...store.tasks.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  }));

  app.get("/api/repositories", async () => ({
    repositories: [...store.repositories.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  }));

  app.post("/api/repositories", async (request, reply) => {
    const parsed = ConnectRepositoryRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid repository request.",
        details: parsed.error.flatten()
      });
    }

    try {
      const ref = parseGitHubRepositoryUrl(parsed.data.repositoryUrl);
      const existing = [...store.repositories.values()].find(
        (repository) => repository.owner === ref.owner && repository.name === ref.name
      );
      if (existing) {
        return reply.status(200).send(existing);
      }

      const repository = {
        id: createId("repo"),
        owner: ref.owner,
        name: ref.name,
        url: ref.url,
        defaultBranch: parsed.data.defaultBranch,
        provider: "github" as const,
        createdAt: new Date()
      };
      store.repositories.set(repository.id, repository);
      persistStore(store);

      return reply.status(201).send(repository);
    } catch (error) {
      return reply.status(400).send({
        error: error instanceof Error ? error.message : "Failed to connect repository."
      });
    }
  });

  app.get("/api/tasks/:taskId", async (request, reply) => {
    const { taskId } = ParamsSchema.parse(request.params);
    const task = store.tasks.get(taskId);
    if (!task) {
      return reply.status(404).send({ error: "Task not found." });
    }

    return {
      ...task,
      approvals: listTaskApprovals(store, taskId),
      traces: store.traces.get(taskId) ?? [],
      logs: store.logs.get(taskId) ?? [],
      repository: store.repositories.get(task.repositoryId),
      tests: store.tests.get(taskId) ?? [],
      e2eArtifacts: store.e2eArtifacts.get(taskId) ?? [],
      diff: store.diffs.get(taskId),
      jobs: listJobs(store).filter((job) => job.taskId === taskId)
    };
  });

  app.get("/api/tasks/:taskId/logs", async (request, reply) => {
    const { taskId } = ParamsSchema.parse(request.params);
    if (!store.tasks.has(taskId)) {
      return reply.status(404).send({ error: "Task not found." });
    }

    return { logs: store.logs.get(taskId) ?? [] };
  });

  app.get("/api/tasks/:taskId/diff", async (request, reply) => {
    const { taskId } = ParamsSchema.parse(request.params);
    const diff = store.diffs.get(taskId);
    if (!diff) {
      return reply.status(404).send({ error: "Diff not available." });
    }

    return diff;
  });

  app.post("/api/tasks/:taskId/approvals/:approvalId/approve", async (request, reply) => {
    const { taskId, approvalId } = ApprovalParamsSchema.parse(request.params);
    const task = store.tasks.get(taskId);
    if (!task) {
      return reply.status(404).send({ error: "Task not found." });
    }

    const approval = listTaskApprovals(store, taskId).find((item) => item.id === approvalId);
    if (!approval) {
      return reply.status(404).send({ error: "Approval not found." });
    }
    if (approval.status !== "PENDING") {
      return reply.status(409).send({ error: "Approval is already resolved." });
    }

    const resolved: Approval = {
      ...approval,
      status: "APPROVED",
      resolvedAt: new Date()
    };
    upsertApproval(store, resolved);

    if (approval.type === "PLAN") {
      return approvePlanFlow(store, task, {
        executeCommands: shouldUseWorkspaceExecution(options),
        commandRunner: options.commandRunner,
        implementationGenerator: options.implementationGenerator,
        e2eArtifactRoot: options.e2eArtifactRoot
      });
    }
    if (approval.type === "CREATE_PR") {
      return approvePrFlow(store, task, resolved, {
        branchPublisher: options.branchPublisher,
        commandRunner: options.commandRunner,
        pullRequestCreator: options.pullRequestCreator
      });
    }

    return store.tasks.get(taskId);
  });

  app.post("/api/tasks/:taskId/approvals/:approvalId/reject", async (request, reply) => {
    const { taskId, approvalId } = ApprovalParamsSchema.parse(request.params);
    const parsed = RejectApprovalRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid rejection request.", details: parsed.error.flatten() });
    }

    const task = store.tasks.get(taskId);
    if (!task) {
      return reply.status(404).send({ error: "Task not found." });
    }

    const approval = listTaskApprovals(store, taskId).find((item) => item.id === approvalId);
    if (!approval) {
      return reply.status(404).send({ error: "Approval not found." });
    }

    upsertApproval(store, {
      ...approval,
      status: "REJECTED",
      payload: { ...approval.payload, rejectionReason: parsed.data.reason },
      resolvedAt: new Date()
    });
    store.tasks.set(taskId, {
      ...task,
      status: "CANCELLED",
      updatedAt: new Date()
    });
    persistStore(store);
    appendTrace(store, createTraceEvent({
      taskId,
      type: "STATE",
      phase: "CANCELLED",
      summary: `${task.status} -> CANCELLED`,
      metadata: {
        from: task.status,
        to: "CANCELLED"
      }
    }));

    return store.tasks.get(taskId);
  });

  app.post("/api/tasks/:taskId/create-pr", async (request, reply) => {
    const { taskId } = ParamsSchema.parse(request.params);
    const parsed = CreatePrRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid PR request.", details: parsed.error.flatten() });
    }

    const task = store.tasks.get(taskId);
    if (!task) {
      return reply.status(404).send({ error: "Task not found." });
    }

    const approval: Approval = {
      id: createId("approval"),
      taskId,
      type: "CREATE_PR",
      status: "PENDING",
      payload: parsed.data,
      createdAt: new Date()
    };
    upsertApproval(store, approval);
    store.logs.set(taskId, [
      ...(store.logs.get(taskId) ?? []),
      createRunLog({
        taskId,
        level: "info",
        phase: "WAITING_FOR_PR_APPROVAL",
        message: "PR creation requested and waiting for approval."
      })
    ]);
    persistStore(store);

    return reply.status(202).send({ approvalId: approval.id, status: approval.status });
  });

  return app;
}
