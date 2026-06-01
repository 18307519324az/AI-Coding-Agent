import type { AgentTask } from "@ai-coding-agent/shared";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanupTaskWorkspaces, createWorkspaceCleanupWorker } from "../src/workspace-cleanup";
import { createStore } from "../src/store";

const tempRoots: string[] = [];

function createTask(input: {
  id: string;
  status: AgentTask["status"];
  updatedAt: Date;
}): AgentTask {
  return {
    id: input.id,
    userId: "local-user",
    repositoryId: "repo_123",
    title: "Workspace cleanup test",
    prompt: "Clean old task workspaces after the retention window.",
    status: input.status,
    createdAt: input.updatedAt,
    updatedAt: input.updatedAt
  };
}

async function createTempWorkspaceRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ai-coding-agent-cleanup-"));
  tempRoots.push(root);
  return root;
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.stat(target);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

describe("workspace cleanup", () => {
  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
  });

  it("removes only terminal task workspaces older than the retention window", async () => {
    const workspaceRoot = await createTempWorkspaceRoot();
    const oldDate = new Date("2026-01-01T00:00:00.000Z");
    const recentDate = new Date("2026-01-07T23:30:00.000Z");
    const now = new Date("2026-01-08T00:00:00.000Z");
    const store = createStore();
    const oldCompleted = createTask({ id: "task_old_completed", status: "COMPLETED", updatedAt: oldDate });
    const recentCompleted = createTask({ id: "task_recent_completed", status: "COMPLETED", updatedAt: recentDate });
    const activeTask = createTask({
      id: "task_active",
      status: "WAITING_FOR_PLAN_APPROVAL",
      updatedAt: oldDate
    });
    [oldCompleted, recentCompleted, activeTask].forEach((task) => store.tasks.set(task.id, task));

    await Promise.all([
      fs.mkdir(path.join(workspaceRoot, oldCompleted.id, "repo"), { recursive: true }),
      fs.mkdir(path.join(workspaceRoot, recentCompleted.id, "repo"), { recursive: true }),
      fs.mkdir(path.join(workspaceRoot, activeTask.id, "repo"), { recursive: true })
    ]);

    const result = await cleanupTaskWorkspaces(store, {
      workspaceRoot,
      retentionMs: 24 * 60 * 60 * 1000,
      now
    });

    expect(result).toMatchObject({
      scanned: 3,
      removed: [oldCompleted.id],
      errors: []
    });
    expect(result.skipped).toEqual(
      expect.arrayContaining([
        { taskId: recentCompleted.id, reason: "retained" },
        { taskId: activeTask.id, reason: "active" }
      ])
    );
    await expect(pathExists(path.join(workspaceRoot, oldCompleted.id))).resolves.toBe(false);
    await expect(pathExists(path.join(workspaceRoot, recentCompleted.id))).resolves.toBe(true);
    await expect(pathExists(path.join(workspaceRoot, activeTask.id))).resolves.toBe(true);
  });

  it("does not run overlapping cleanup passes", async () => {
    let release: ((value: Awaited<ReturnType<typeof cleanupTaskWorkspaces>>) => void) | undefined;
    let calls = 0;
    const worker = createWorkspaceCleanupWorker({
      intervalMs: 50,
      cleanup: () => {
        calls += 1;
        return new Promise((resolve) => {
          release = resolve;
        });
      }
    });

    const first = worker.processOnce();
    const second = worker.processOnce();

    await expect(second).resolves.toBeUndefined();
    expect(calls).toBe(1);

    release?.({
      scanned: 0,
      removed: [],
      skipped: [],
      errors: []
    });
    await expect(first).resolves.toMatchObject({ scanned: 0 });
  });
});
