export type GitHubRepositoryRef = {
  owner: string;
  name: string;
  url: string;
};

export type GitHubIssueRef = GitHubRepositoryRef & {
  issueNumber: number;
};

export function parseGitHubRepositoryUrl(url: string): GitHubRepositoryRef {
  const parsed = new URL(url);
  if (parsed.hostname !== "github.com") {
    throw new Error("Only github.com repositories are supported in the MVP.");
  }

  const [owner, rawName] = parsed.pathname.replace(/^\/+/, "").split("/");
  const name = rawName?.replace(/\.git$/, "");
  if (!owner || !name) {
    throw new Error("GitHub repository URL must include owner and repository name.");
  }

  return {
    owner,
    name,
    url: `https://github.com/${owner}/${name}`
  };
}

export function parseGitHubIssueUrl(url: string): GitHubIssueRef {
  const parsed = new URL(url);
  if (parsed.hostname !== "github.com") {
    throw new Error("Only github.com issue URLs are supported.");
  }

  const [owner, name, kind, issueNumber] = parsed.pathname.replace(/^\/+/, "").split("/");
  if (!owner || !name || kind !== "issues" || !issueNumber) {
    throw new Error("GitHub issue URL must look like https://github.com/owner/repo/issues/123.");
  }

  const number = Number(issueNumber);
  if (!Number.isInteger(number) || number < 1) {
    throw new Error("GitHub issue number must be a positive integer.");
  }

  return {
    owner,
    name,
    url: `https://github.com/${owner}/${name}`,
    issueNumber: number
  };
}

