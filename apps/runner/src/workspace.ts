import path from "node:path";
import simpleGit from "simple-git";

export function getWorkspaceRoot(): string {
  return process.env.WORKSPACE_ROOT ?? path.resolve(process.cwd(), ".workspaces");
}

export function getTaskWorkspace(taskId: string): string {
  return path.join(getWorkspaceRoot(), taskId, "repo");
}

export async function cloneRepository(input: {
  repositoryUrl: string;
  taskId: string;
}): Promise<string> {
  const target = getTaskWorkspace(input.taskId);
  await simpleGit().clone(input.repositoryUrl, target, ["--depth", "1"]);
  return target;
}

