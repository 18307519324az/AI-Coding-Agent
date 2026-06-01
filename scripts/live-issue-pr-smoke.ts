import { parseGitHubIssueUrl, redactSecrets } from "@ai-coding-agent/agent-core";
import type { Approval, PlanOutput, TestResult } from "@ai-coding-agent/shared";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getGitHubIssue } from "../apps/runner/src/github-service";
import { resolveCreateTaskRequest } from "../apps/runner/src/issue-service";
import {
  approvePlanFlow,
  approvePrFlow,
  createTaskFlow,
  type ImplementationGenerator,
  type PlanGenerator
} from "../apps/runner/src/mock-flow";
import { analyzeProject } from "../apps/runner/src/project-analyzer";
import { createStore, listTaskApprovals, type RunnerStore } from "../apps/runner/src/store";
import { cloneRepository } from "../apps/runner/src/workspace";

const confirmationPhrase = "create-draft-pr";

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

function booleanEnv(name: string, fallback: boolean): boolean {
  const value = env(name);
  if (!value) {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function requireGitHubTokenEnv(): void {
  if (!env("GITHUB_TOKEN") && !env("GITHUB_PERSONAL_ACCESS_TOKEN")) {
    throw new Error("GITHUB_TOKEN or GITHUB_PERSONAL_ACCESS_TOKEN is required for GitHub issue intake and draft PR creation.");
  }
}

function assertSafeIssueUrl(issueUrl: string): void {
  const parsed = new URL(issueUrl);
  if (parsed.username || parsed.password) {
    throw new Error("LIVE_ISSUE_PR_SMOKE_ISSUE_URL must not contain credentials.");
  }
  if (parsed.hostname !== "github.com") {
    throw new Error("LIVE_ISSUE_PR_SMOKE_ISSUE_URL must point to github.com.");
  }
  parseGitHubIssueUrl(issueUrl);
}

function uniqueStamp(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
}

function createIssueSmokePlan(input: {
  issueNumber: number;
  issueUrl: string;
  markerPath: string;
}): PlanGenerator {
  return async (): Promise<PlanOutput> => ({
    summary: "Create a small smoke-test marker file to verify the live GitHub issue-to-PR path.",
    assumptions: [
      "The target issue belongs to a disposable test repository.",
      "The configured GitHub token can read the issue, push a branch, and create a draft Pull Request."
    ],
    targetFiles: [input.markerPath],
    steps: [
      `Read GitHub issue #${input.issueNumber}.`,
      "Clone the issue repository into an isolated workspace.",
      "Add a bounded marker file under the smoke-test directory.",
      "Run detected repository verification commands.",
      "Publish a task branch after approval.",
      "Create a draft GitHub Pull Request linked to the issue context."
    ],
    risks: [
      "This creates a real branch and draft Pull Request in the target repository.",
      `The smoke marker references ${input.issueUrl}.`
    ],
    requiresApproval: true
  });
}

function createIssueSmokeImplementation(input: {
  issueNumber: number;
  issueTitle: string;
  issueUrl: string;
  markerPath: string;
  repositoryUrl: string;
  stamp: string;
}): ImplementationGenerator {
  return async () => ({
    summary: "Added live issue-to-PR smoke marker.",
    edits: [
      {
        path: input.markerPath,
        content: [
          "# AI Coding Agent Live Issue-to-PR Smoke",
          "",
          `Run: ${input.stamp}`,
          `Repository: ${input.repositoryUrl}`,
          `Issue: #${input.issueNumber} ${input.issueTitle}`,
          `Issue URL: ${input.issueUrl}`,
          "",
          "This file was created by the AI Coding Agent live issue-to-PR smoke harness.",
          "It is safe to remove when the smoke Pull Request is closed.",
          ""
        ].join("\n")
      }
    ],
    risks: [
      "The change is intentionally limited to a smoke marker file."
    ]
  });
}

function findPendingApproval(store: RunnerStore, taskId: string, type: Approval["type"]): Approval {
  const approval = listTaskApprovals(store, taskId).find((item) => item.type === type && item.status === "PENDING");
  if (!approval) {
    throw new Error(`Pending ${type} approval was not created for ${taskId}.`);
  }
  return approval;
}

function getTaskTests(store: RunnerStore, taskId: string): TestResult[] {
  return store.tests.get(taskId) ?? [];
}

function printTaskLogs(store: RunnerStore, taskId: string): void {
  for (const log of store.logs.get(taskId) ?? []) {
    console.error(`${log.phase}: ${redactSecrets(log.message)}`);
  }
}

async function withLivePrMode<T>(workspaceRoot: string, run: () => Promise<T>): Promise<T> {
  const previousMode = process.env.GITHUB_PR_MODE;
  const previousWorkspaceRoot = process.env.WORKSPACE_ROOT;
  process.env.GITHUB_PR_MODE = "live";
  process.env.WORKSPACE_ROOT = workspaceRoot;

  try {
    return await run();
  } finally {
    if (previousMode === undefined) {
      delete process.env.GITHUB_PR_MODE;
    } else {
      process.env.GITHUB_PR_MODE = previousMode;
    }

    if (previousWorkspaceRoot === undefined) {
      delete process.env.WORKSPACE_ROOT;
    } else {
      process.env.WORKSPACE_ROOT = previousWorkspaceRoot;
    }
  }
}

async function main(): Promise<void> {
  if (env("LIVE_ISSUE_PR_SMOKE_CONFIRM") !== confirmationPhrase) {
    throw new Error(`Set LIVE_ISSUE_PR_SMOKE_CONFIRM=${confirmationPhrase} to create a real draft Pull Request from a GitHub issue.`);
  }

  requireGitHubTokenEnv();
  const issueUrl = requireEnv("LIVE_ISSUE_PR_SMOKE_ISSUE_URL");
  assertSafeIssueUrl(issueUrl);

  const issueRef = parseGitHubIssueUrl(issueUrl);
  const repositoryUrl = issueRef.url;
  const stamp = uniqueStamp();
  const markerPath = env("LIVE_ISSUE_PR_SMOKE_MARKER_PATH") ??
    `ai-coding-agent-issue-smoke/issue-${issueRef.issueNumber}-${stamp}.md`;
  const baseBranch = env("LIVE_ISSUE_PR_SMOKE_BASE_BRANCH") ?? "main";
  const resultFile = env("LIVE_ISSUE_PR_SMOKE_RESULT_FILE");
  const workspaceRoot = path.resolve(
    env("LIVE_ISSUE_PR_SMOKE_WORKSPACE_ROOT") ?? path.join(process.cwd(), ".runner-data", "live-issue-pr-smoke-workspaces")
  );
  const allowInstall = booleanEnv("LIVE_ISSUE_PR_SMOKE_ALLOW_INSTALL", false);
  const requireTests = booleanEnv("LIVE_ISSUE_PR_SMOKE_REQUIRE_TESTS", true);

  await mkdir(workspaceRoot, { recursive: true });

  const request = await resolveCreateTaskRequest(
    {
      repositoryUrl,
      issueUrl,
      branchPrefix: "agent/live-issue-pr-smoke",
      testCommandOverride: env("LIVE_ISSUE_PR_SMOKE_TEST_COMMAND"),
      allowDependencyInstall: allowInstall,
      allowCreatePr: true
    },
    getGitHubIssue
  );

  const store = createStore();

  await withLivePrMode(workspaceRoot, async () => {
    const task = await createTaskFlow(store, request, {
      workspaceExecution: true,
      repositoryCloner: cloneRepository,
      projectAnalyzer: analyzeProject,
      planGenerator: createIssueSmokePlan({
        issueNumber: issueRef.issueNumber,
        issueUrl,
        markerPath
      })
    });

    if (task.status !== "WAITING_FOR_PLAN_APPROVAL") {
      printTaskLogs(store, task.id);
      throw new Error(`Expected WAITING_FOR_PLAN_APPROVAL, got ${task.status}.`);
    }

    findPendingApproval(store, task.id, "PLAN");
    const readyForPr = await approvePlanFlow(store, task, {
      executeCommands: true,
      implementationGenerator: createIssueSmokeImplementation({
        issueNumber: issueRef.issueNumber,
        issueTitle: request.title,
        issueUrl,
        markerPath,
        repositoryUrl,
        stamp
      })
    });

    if (readyForPr.status !== "WAITING_FOR_PR_APPROVAL") {
      printTaskLogs(store, task.id);
      throw new Error(`Expected WAITING_FOR_PR_APPROVAL, got ${readyForPr.status}.`);
    }

    const tests = getTaskTests(store, task.id);
    if (requireTests && tests.length === 0) {
      printTaskLogs(store, task.id);
      throw new Error("No repository verification commands ran. Use a test repo with scripts or set LIVE_ISSUE_PR_SMOKE_REQUIRE_TESTS=0.");
    }
    const failedTest = tests.find((test) => test.status !== "PASSED");
    if (failedTest) {
      printTaskLogs(store, task.id);
      throw new Error(`Verification failed: ${failedTest.command} ${failedTest.status}.`);
    }

    const repository = store.repositories.get(readyForPr.repositoryId);
    if (repository) {
      store.repositories.set(repository.id, {
        ...repository,
        defaultBranch: baseBranch
      });
    }

    const prApproval = findPendingApproval(store, task.id, "CREATE_PR");
    const completed = await approvePrFlow(store, readyForPr, prApproval);

    if (completed.status !== "COMPLETED" || !completed.prUrl) {
      printTaskLogs(store, task.id);
      throw new Error(`Expected COMPLETED with a PR URL, got ${completed.status}.`);
    }

    console.log("Live issue-to-PR smoke completed.");
    console.log(`Issue: ${issueUrl}`);
    console.log(`Task: ${completed.id}`);
    console.log(`Branch: ${completed.branchName ?? "unknown"}`);
    console.log(`PR: ${completed.prUrl}`);

    if (resultFile) {
      const target = path.resolve(resultFile);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, `${JSON.stringify({
        completedAt: new Date().toISOString(),
        repositoryUrl,
        issueUrl,
        issueNumber: issueRef.issueNumber,
        issueTitle: request.title,
        baseBranch,
        taskId: completed.id,
        branchName: completed.branchName,
        prUrl: completed.prUrl,
        markerPath,
        tests: tests.map((test) => ({
          command: test.command,
          status: test.status,
          durationMs: test.durationMs
        }))
      }, null, 2)}\n`, "utf8");
      console.log(`Result file: ${target}`);
    }
  });
}

main().catch((error: unknown) => {
  console.error(redactSecrets(error instanceof Error ? error.message : String(error)));
  process.exit(1);
});
