import fs from "node:fs/promises";
import path from "node:path";

export type TaskWorkspacePaths = {
  root: string;
  repository: string;
};

export function sanitizeTaskId(taskId: string): string {
  if (!/^task_[A-Za-z0-9_-]+$/.test(taskId)) {
    throw new Error("Invalid task id for workspace path.");
  }

  return taskId;
}

export function assertPathInside(parent: string, candidate: string): void {
  const resolvedParent = path.resolve(parent);
  const resolvedCandidate = path.resolve(candidate);
  const relative = path.relative(resolvedParent, resolvedCandidate);

  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return;
  }

  throw new Error(`Workspace path escapes allowed root: ${resolvedCandidate}`);
}

export function getTaskWorkspacePaths(input: {
  workspaceRoot: string;
  taskId: string;
}): TaskWorkspacePaths {
  const safeTaskId = sanitizeTaskId(input.taskId);
  const root = path.resolve(input.workspaceRoot, safeTaskId);
  const repository = path.resolve(root, "repo");

  assertPathInside(input.workspaceRoot, root);
  assertPathInside(input.workspaceRoot, repository);

  return { root, repository };
}

export async function ensureTaskWorkspace(paths: TaskWorkspacePaths): Promise<void> {
  await fs.mkdir(paths.root, { recursive: true });
}

