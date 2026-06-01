import type { AgentTaskStatus } from "@ai-coding-agent/shared";
import fs from "node:fs/promises";
import { getTaskWorkspacePaths } from "./workspace-policy";
import type { RunnerStore } from "./store";

const terminalTaskStatuses = new Set<AgentTaskStatus>([
  "COMPLETED",
  "FAILED_CLONE",
  "FAILED_CONTEXT",
  "FAILED_IMPLEMENTATION",
  "FAILED_TEST",
  "FAILED_E2E",
  "FAILED_PR_CREATE",
  "FAILED",
  "CANCELLED"
]);

export type WorkspaceCleanupOptions = {
  workspaceRoot: string;
  retentionMs: number;
  now?: Date;
};

export type WorkspaceCleanupResult = {
  scanned: number;
  removed: string[];
  skipped: Array<{
    taskId: string;
    reason: "active" | "retained" | "missing";
  }>;
  errors: Array<{
    taskId: string;
    message: string;
  }>;
};

export type WorkspaceCleanupWorker = {
  isRunning: () => boolean;
  processOnce: () => Promise<WorkspaceCleanupResult | undefined>;
  start: () => void;
  stop: () => void;
};

function isTerminalStatus(status: AgentTaskStatus): boolean {
  return terminalTaskStatuses.has(status);
}

async function exists(path: string): Promise<boolean> {
  try {
    await fs.stat(path);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export async function cleanupTaskWorkspaces(
  store: RunnerStore,
  options: WorkspaceCleanupOptions
): Promise<WorkspaceCleanupResult> {
  const now = options.now ?? new Date();
  const cutoff = now.getTime() - options.retentionMs;
  const result: WorkspaceCleanupResult = {
    scanned: 0,
    removed: [],
    skipped: [],
    errors: []
  };

  for (const task of store.tasks.values()) {
    result.scanned += 1;
    if (!isTerminalStatus(task.status)) {
      result.skipped.push({ taskId: task.id, reason: "active" });
      continue;
    }
    if (task.updatedAt.getTime() > cutoff) {
      result.skipped.push({ taskId: task.id, reason: "retained" });
      continue;
    }

    try {
      const paths = getTaskWorkspacePaths({
        workspaceRoot: options.workspaceRoot,
        taskId: task.id
      });
      if (!(await exists(paths.root))) {
        result.skipped.push({ taskId: task.id, reason: "missing" });
        continue;
      }

      await fs.rm(paths.root, { recursive: true, force: true });
      result.removed.push(task.id);
    } catch (error) {
      result.errors.push({
        taskId: task.id,
        message: error instanceof Error ? error.message : "Workspace cleanup failed."
      });
    }
  }

  return result;
}

export function createWorkspaceCleanupWorker(input: {
  intervalMs: number;
  cleanup: () => Promise<WorkspaceCleanupResult>;
  onError?: (error: unknown) => void;
}): WorkspaceCleanupWorker {
  let timer: ReturnType<typeof setInterval> | undefined;
  let processing = false;

  const processOnce = async (): Promise<WorkspaceCleanupResult | undefined> => {
    if (processing) {
      return undefined;
    }

    processing = true;
    try {
      return await input.cleanup();
    } catch (error) {
      input.onError?.(error);
      return undefined;
    } finally {
      processing = false;
    }
  };

  return {
    isRunning: () => Boolean(timer),
    processOnce,
    start: () => {
      if (timer) {
        return;
      }

      timer = setInterval(() => {
        void processOnce();
      }, input.intervalMs);
      timer.unref?.();
      void processOnce();
    },
    stop: () => {
      if (!timer) {
        return;
      }

      clearInterval(timer);
      timer = undefined;
    }
  };
}
