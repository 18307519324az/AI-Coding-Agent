import { redactSecrets } from "@ai-coding-agent/agent-core";
import type { Approval, PlanOutput, ResolvedCreateTaskRequest, TestResult } from "@ai-coding-agent/shared";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
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
    throw new Error("GITHUB_TOKEN or GITHUB_PERSONAL_ACCESS_TOKEN is required for GitHub draft PR creation.");
  }
}

function assertSafeRepositoryUrl(repositoryUrl: string): void {
  const parsed = new URL(repositoryUrl);
  if (parsed.username || parsed.password) {
    throw new Error("LIVE_PR_SMOKE_REPOSITORY_URL must not contain credentials.");
  }
  if (parsed.hostname !== "github.com") {
    throw new Error("LIVE_PR_SMOKE_REPOSITORY_URL must point to github.com.");
  }
}

function uniqueStamp(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
}

function createSmokePlan(markerPath: string): PlanGenerator {
  return async (): Promise<PlanOutput> => ({
    summary: "Create a small smoke-test marker file to verify the live GitHub PR path.",
    assumptions: [
      "The target repository is a disposable test repository.",
      "The configured GitHub token can push a branch and create a draft Pull Request."
    ],
    targetFiles: [markerPath],
    steps: [
      "Clone the test repository into an isolated workspace.",
      "Add a bounded marker file under the smoke-test directory.",
      "Run detected repository verification commands.",
      "Publish a task branch after approval.",
      "Create a draft GitHub Pull Request."
    ],
    risks: [
      "This creates a real branch and draft Pull Request in the target repository."
    ],
    requiresApproval: true
  });
}

function createSmokeImplementation(input: {
  markerPath: string;
  repositoryUrl: string;
  stamp: string;
}): ImplementationGenerator {
  return async () => ({
    summary: "Added live PR smoke marker.",
    edits: [
      {
        path: input.markerPath,
        content: [
          "# AI Coding Agent Live PR Smoke",
          "",
          `Run: ${input.stamp}`,
          `Repository: ${input.repositoryUrl}`,
          "",
          "This file was created by the AI Coding Agent live PR smoke harness.",
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

function createSmokeProjectAnalyzer(input: { skipE2e: boolean }) {
  return async (rootPath: string) => {
    const context = await analyzeProject(rootPath);
    if (!input.skipE2e) {
      return context;
    }

    return {
      ...context,
      recommendedCommands: {
        ...context.recommendedCommands,
        e2e: undefined
      }
    };
  };
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
  if (env("LIVE_PR_SMOKE_CONFIRM") !== confirmationPhrase) {
    throw new Error(`Set LIVE_PR_SMOKE_CONFIRM=${confirmationPhrase} to create a real draft Pull Request.`);
  }

  requireGitHubTokenEnv();
  const repositoryUrl = requireEnv("LIVE_PR_SMOKE_REPOSITORY_URL");
  assertSafeRepositoryUrl(repositoryUrl);

  const stamp = uniqueStamp();
  const markerPath = env("LIVE_PR_SMOKE_MARKER_PATH") ?? `ai-coding-agent-smoke/${stamp}.md`;
  const baseBranch = env("LIVE_PR_SMOKE_BASE_BRANCH") ?? "main";
  const resultFile = env("LIVE_PR_SMOKE_RESULT_FILE");
  const workspaceRoot = path.resolve(
    env("LIVE_PR_SMOKE_WORKSPACE_ROOT") ?? path.join(process.cwd(), ".runner-data", "live-pr-smoke-workspaces")
  );
  const allowInstall = booleanEnv("LIVE_PR_SMOKE_ALLOW_INSTALL", false);
  const requireTests = booleanEnv("LIVE_PR_SMOKE_REQUIRE_TESTS", true);
  const skipE2e = booleanEnv("LIVE_PR_SMOKE_SKIP_E2E", false);

  await mkdir(workspaceRoot, { recursive: true });

  const request: ResolvedCreateTaskRequest = {
    repositoryUrl,
    title: `Live PR smoke ${stamp}`,
    prompt: "Create a bounded smoke marker file and verify the live GitHub PR creation path.",
    branchPrefix: "agent/live-pr-smoke",
    testCommandOverride: env("LIVE_PR_SMOKE_TEST_COMMAND"),
    allowDependencyInstall: allowInstall,
    allowCreatePr: true
  };

  const store = createStore();

  await withLivePrMode(workspaceRoot, async () => {
    const task = await createTaskFlow(store, request, {
      workspaceExecution: true,
      repositoryCloner: cloneRepository,
      projectAnalyzer: createSmokeProjectAnalyzer({ skipE2e }),
      planGenerator: createSmokePlan(markerPath)
    });

    if (task.status !== "WAITING_FOR_PLAN_APPROVAL") {
      printTaskLogs(store, task.id);
      throw new Error(`Expected WAITING_FOR_PLAN_APPROVAL, got ${task.status}.`);
    }

    findPendingApproval(store, task.id, "PLAN");
    const readyForPr = await approvePlanFlow(store, task, {
      executeCommands: true,
      implementationGenerator: createSmokeImplementation({
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
      throw new Error("No repository verification commands ran. Use a test repo with scripts or set LIVE_PR_SMOKE_REQUIRE_TESTS=0.");
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

    console.log("Live PR smoke completed.");
    console.log(`Task: ${completed.id}`);
    console.log(`Branch: ${completed.branchName ?? "unknown"}`);
    console.log(`PR: ${completed.prUrl}`);

    if (resultFile) {
      const target = path.resolve(resultFile);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, `${JSON.stringify({
        completedAt: new Date().toISOString(),
        repositoryUrl,
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
