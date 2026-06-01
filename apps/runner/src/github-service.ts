import { Octokit } from "@octokit/rest";
import { parseGitHubIssueUrl } from "@ai-coding-agent/agent-core";

export type CreatePullRequestInput = {
  owner: string;
  repo: string;
  title: string;
  body: string;
  head: string;
  base: string;
  draft?: boolean;
};

export type GitHubIssueDetails = {
  title: string;
  body: string;
  issueNumber: number;
  url: string;
  repositoryUrl: string;
};

export async function createPullRequest(input: CreatePullRequestInput): Promise<string> {
  const token = process.env.GITHUB_TOKEN ?? process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
  if (!token) {
    throw new Error("Missing GITHUB_TOKEN or GITHUB_PERSONAL_ACCESS_TOKEN.");
  }

  const octokit = new Octokit({ auth: token });
  const response = await octokit.pulls.create({
    owner: input.owner,
    repo: input.repo,
    title: input.title,
    body: input.body,
    head: input.head,
    base: input.base,
    draft: input.draft ?? true
  });

  return response.data.html_url;
}

export async function getGitHubIssue(issueUrl: string): Promise<GitHubIssueDetails> {
  const ref = parseGitHubIssueUrl(issueUrl);
  const token = process.env.GITHUB_TOKEN ?? process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
  const octokit = new Octokit(token ? { auth: token } : {});
  const response = await octokit.issues.get({
    owner: ref.owner,
    repo: ref.name,
    issue_number: ref.issueNumber
  });

  return {
    title: response.data.title,
    body: response.data.body ?? "",
    issueNumber: ref.issueNumber,
    url: response.data.html_url,
    repositoryUrl: ref.url
  };
}
