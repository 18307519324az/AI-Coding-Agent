import cors from "@fastify/cors";
import {
  ConnectRepositoryRequestSchema,
  CreatePrRequestSchema,
  CreateTaskRequestSchema,
  RejectApprovalRequestSchema
} from "@ai-coding-agent/shared";
import type { Approval } from "@ai-coding-agent/shared";
import Fastify from "fastify";
import { z } from "zod";
import { parseGitHubRepositoryUrl } from "@ai-coding-agent/agent-core";
import { createId } from "./ids";
import { createRunLog } from "./log";
import { approvePlanFlow, approvePrFlow, createTaskFlow } from "./mock-flow";
import { createStore, listTaskApprovals, upsertApproval, type RunnerStore } from "./store";

const ParamsSchema = z.object({
  taskId: z.string()
});

const ApprovalParamsSchema = ParamsSchema.extend({
  approvalId: z.string()
});

export function createServer(store: RunnerStore = createStore()) {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      redact: ["req.headers.authorization"]
    }
  });

  app.register(cors, {
    origin: true
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
      const task = createTaskFlow(store, parsed.data);
      return reply.status(201).send({ taskId: task.id, status: task.status });
    } catch (error) {
      return reply.status(400).send({
        error: error instanceof Error ? error.message : "Failed to create task."
      });
    }
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
      logs: store.logs.get(taskId) ?? [],
      repository: store.repositories.get(task.repositoryId),
      tests: store.tests.get(taskId) ?? [],
      diff: store.diffs.get(taskId)
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
      return approvePlanFlow(store, task);
    }
    if (approval.type === "CREATE_PR") {
      return approvePrFlow(store, task);
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

    return reply.status(202).send({ approvalId: approval.id, status: approval.status });
  });

  return app;
}
