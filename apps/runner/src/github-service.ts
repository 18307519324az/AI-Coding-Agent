import { Octokit } from "@octokit/rest";

export type CreatePullRequestInput = {
  owner: string;
  repo: string;
  title: string;
  body: string;
  head: string;
  base: string;
  draft?: boolean;
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

