import path from "node:path";
import simpleGit from "simple-git";
import { ensureTaskWorkspace, getTaskWorkspacePaths } from "./workspace-policy";

export function getWorkspaceRoot(): string {
  return process.env.WORKSPACE_ROOT ?? path.resolve(process.cwd(), ".workspaces");
}

export function getTaskWorkspace(taskId: string): string {
  return getTaskWorkspacePaths({
    workspaceRoot: getWorkspaceRoot(),
    taskId
  }).repository;
}

export async function cloneRepository(input: {
  repositoryUrl: string;
  taskId: string;
}): Promise<string> {
  const paths = getTaskWorkspacePaths({
    workspaceRoot: getWorkspaceRoot(),
    taskId: input.taskId
  });
  await ensureTaskWorkspace(paths);
  const target = paths.repository;
  await simpleGit().clone(input.repositoryUrl, target, ["--depth", "1"]);
  return target;
}
