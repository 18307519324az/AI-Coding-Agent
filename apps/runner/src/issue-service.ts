import type { CreateTaskRequest, ResolvedCreateTaskRequest } from "@ai-coding-agent/shared";
import { getGitHubIssue, type GitHubIssueDetails } from "./github-service";

export type IssueFetcher = (issueUrl: string) => Promise<GitHubIssueDetails>;

function buildPrompt(issue: GitHubIssueDetails): string {
  const body = issue.body.trim() || "No issue body was provided.";
  return [
    `GitHub issue #${issue.issueNumber}: ${issue.title}`,
    "",
    `Issue URL: ${issue.url}`,
    "",
    body
  ].join("\n");
}

export async function resolveCreateTaskRequest(
  request: CreateTaskRequest,
  issueFetcher: IssueFetcher = getGitHubIssue
): Promise<ResolvedCreateTaskRequest> {
  if (request.title && request.prompt) {
    return request as ResolvedCreateTaskRequest;
  }

  if (!request.issueUrl) {
    throw new Error("Task title and prompt are required unless issueUrl is provided.");
  }

  const issue = await issueFetcher(request.issueUrl);
  return {
    ...request,
    title: request.title ?? issue.title,
    prompt: request.prompt ?? buildPrompt(issue)
  };
}
