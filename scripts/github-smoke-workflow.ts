import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import path from "node:path";

type SmokeResult = {
  completedAt: string;
  repositoryUrl: string;
  issueUrl?: string;
  issueNumber?: number;
  issueTitle?: string;
  baseBranch: string;
  taskId: string;
  branchName?: string;
  prUrl: string;
  markerPath: string;
  tests: Array<{
    command: string;
    status: string;
    durationMs: number;
  }>;
};

type GitHubIssue = {
  html_url: string;
  number: number;
  title: string;
};

type GitHubError = {
  message?: string;
};

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function requireEnv(name: string): string {
  const value = env(name);
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function repositoryParts(): { owner: string; repo: string } {
  const repository = requireEnv("GITHUB_REPOSITORY");
  const [owner, repo] = repository.split("/");
  if (!owner || !repo) {
    throw new Error("GITHUB_REPOSITORY must be formatted as owner/repo.");
  }
  return { owner, repo };
}

function apiHeaders(): HeadersInit {
  return {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${requireEnv("GITHUB_TOKEN")}`,
    "content-type": "application/json",
    "x-github-api-version": "2022-11-28"
  };
}

async function requestGitHub<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...apiHeaders(),
      ...(init.headers ?? {})
    }
  });

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json() as GitHubError;
      if (body.message) {
        message = body.message;
      }
    } catch {
      // Keep the HTTP status fallback.
    }
    throw new Error(`GitHub API request failed: ${message}`);
  }

  return await response.json() as T;
}

function stamp(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
}

async function writeGitHubOutput(values: Record<string, string | number>): Promise<void> {
  const outputPath = env("GITHUB_OUTPUT");
  if (!outputPath) {
    return;
  }

  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`);
  await appendFile(outputPath, `${lines.join("\n")}\n`, "utf8");
}

async function createIssue(): Promise<void> {
  const { owner, repo } = repositoryParts();
  const runId = env("GITHUB_RUN_ID") ?? "local";
  const runUrl = `${env("GITHUB_SERVER_URL") ?? "https://github.com"}/${owner}/${repo}/actions/runs/${runId}`;
  const id = stamp();
  const issue = await requestGitHub<GitHubIssue>(`https://api.github.com/repos/${owner}/${repo}/issues`, {
    method: "POST",
    body: JSON.stringify({
      title: `AI Coding Agent live issue smoke ${id}`,
      body: [
        "Automated issue for the AI Coding Agent live issue-to-PR smoke harness.",
        "",
        `Workflow run: ${runUrl}`,
        `Commit: ${env("GITHUB_SHA") ?? "unknown"}`
      ].join("\n")
    })
  });

  await writeGitHubOutput({
    issue_url: issue.html_url,
    issue_number: issue.number,
    issue_title: issue.title
  });
  console.log(`Created smoke issue ${issue.html_url}`);
}

async function closeIssue(): Promise<void> {
  const issueNumber = env("SMOKE_ISSUE_NUMBER");
  if (!issueNumber) {
    console.log("No smoke issue number was provided; skipping close.");
    return;
  }

  const { owner, repo } = repositoryParts();
  const issueApiUrl = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`;
  await requestGitHub(`${issueApiUrl}/comments`, {
    method: "POST",
    body: JSON.stringify({
      body: "Live issue-to-PR smoke completed; closing this temporary verification issue."
    })
  });
  await requestGitHub(issueApiUrl, {
    method: "PATCH",
    body: JSON.stringify({
      state: "closed",
      state_reason: "completed"
    })
  });
  console.log(`Closed smoke issue #${issueNumber}`);
}

async function readSmokeResult(filePath: string): Promise<SmokeResult> {
  return JSON.parse(await readFile(filePath, "utf8")) as SmokeResult;
}

function workflowRunUrl(): string | undefined {
  const repository = env("GITHUB_REPOSITORY");
  const runId = env("GITHUB_RUN_ID");
  if (!repository || !runId) {
    return undefined;
  }
  return `${env("GITHUB_SERVER_URL") ?? "https://github.com"}/${repository}/actions/runs/${runId}`;
}

function renderTests(result: SmokeResult): string {
  return result.tests.map((test) => `- \`${test.command}\`: ${test.status} (${test.durationMs} ms)`).join("\n");
}

async function recordResults(): Promise<void> {
  const livePr = await readSmokeResult(requireEnv("LIVE_PR_SMOKE_RESULT_FILE"));
  const liveIssuePr = await readSmokeResult(requireEnv("LIVE_ISSUE_PR_SMOKE_RESULT_FILE"));
  const outputDir = path.resolve("docs", "verification", "live-github-smoke");
  await mkdir(outputDir, { recursive: true });

  const generatedAt = new Date().toISOString();
  const record = {
    generatedAt,
    workflowRunUrl: workflowRunUrl(),
    repository: env("GITHUB_REPOSITORY"),
    commit: env("GITHUB_SHA"),
    livePr,
    liveIssuePr
  };

  await writeFile(path.join(outputDir, "latest.json"), `${JSON.stringify(record, null, 2)}\n`, "utf8");
  await writeFile(path.join(outputDir, "latest.md"), [
    "# Live GitHub Smoke Verification",
    "",
    `Generated at: ${generatedAt}`,
    `Workflow run: ${record.workflowRunUrl ?? "unknown"}`,
    `Repository: ${record.repository ?? "unknown"}`,
    `Commit: ${record.commit ?? "unknown"}`,
    "",
    "## Live PR Smoke",
    "",
    `- PR: ${livePr.prUrl}`,
    `- Branch: \`${livePr.branchName ?? "unknown"}\``,
    `- Marker: \`${livePr.markerPath}\``,
    `- Base branch: \`${livePr.baseBranch}\``,
    "",
    renderTests(livePr),
    "",
    "## Live Issue-to-PR Smoke",
    "",
    `- Issue: ${liveIssuePr.issueUrl ?? "unknown"}`,
    `- PR: ${liveIssuePr.prUrl}`,
    `- Branch: \`${liveIssuePr.branchName ?? "unknown"}\``,
    `- Marker: \`${liveIssuePr.markerPath}\``,
    `- Base branch: \`${liveIssuePr.baseBranch}\``,
    "",
    renderTests(liveIssuePr),
    ""
  ].join("\n"), "utf8");

  console.log(`Recorded live smoke verification in ${outputDir}`);
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === "create-issue") {
    await createIssue();
    return;
  }
  if (command === "close-issue") {
    await closeIssue();
    return;
  }
  if (command === "record-results") {
    await recordResults();
    return;
  }
  throw new Error("Usage: tsx scripts/github-smoke-workflow.ts <create-issue|close-issue|record-results>");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
