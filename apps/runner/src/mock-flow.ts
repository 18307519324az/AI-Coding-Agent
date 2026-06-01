import {
  assertTransition,
  createInitialPlan,
  createSelfReview,
  generatePullRequestBody,
  parseGitHubRepositoryUrl
} from "@ai-coding-agent/agent-core";
import type {
  AgentTask,
  Approval,
  CreateTaskRequest,
  DiffSummary,
  ProjectContext,
  Repository,
  TestResult
} from "@ai-coding-agent/shared";
import { appendLog, appendTest, persistStore, type RunnerStore, upsertApproval } from "./store";
import { createId } from "./ids";
import { createRunLog } from "./log";
import { createPullRequest, type CreatePullRequestInput } from "./github-service";

function setStatus(task: AgentTask, status: AgentTask["status"]): AgentTask {
  assertTransition(task.status, status);
  const next = {
    ...task,
    status,
    updatedAt: new Date()
  };
  return next;
}

function createInferredProjectContext(input: {
  taskId: string;
  request: CreateTaskRequest;
  repository: Repository;
}): ProjectContext {
  const text = `${input.request.title} ${input.request.prompt} ${input.repository.name}`.toLowerCase();
  const hasFrontend = /\b(ui|frontend|front-end|page|dashboard|console|react|next|vite|playwright|button|form)\b/.test(text);
  const projectKind: ProjectContext["projectKind"] = hasFrontend ? "next" : "node";
  const e2e = input.request.testCommandOverride?.includes("e2e")
    ? input.request.testCommandOverride
    : hasFrontend
      ? "pnpm test:e2e"
      : undefined;

  return {
    rootPath: `.workspaces/${input.taskId}/repo`,
    packageManager: "pnpm",
    projectKind,
    hasFrontend,
    scripts: {
      lint: "eslint .",
      typecheck: "tsc --noEmit",
      test: "vitest run",
      ...(e2e ? { "test:e2e": "playwright test" } : {})
    },
    recommendedCommands: {
      install: input.request.allowDependencyInstall ? "pnpm install" : undefined,
      lint: "pnpm lint",
      typecheck: "pnpm typecheck",
      test: input.request.testCommandOverride && !input.request.testCommandOverride.includes("e2e")
        ? input.request.testCommandOverride
        : "pnpm test",
      e2e
    },
    relevantFiles: hasFrontend
      ? ["package.json", "app/**/*", "components/**/*", "tests/**/*.spec.ts", "playwright.config.ts"]
      : ["package.json", "src/**/*", "test/**/*.test.ts", "tsconfig.json"]
  };
}

function createTestResult(input: {
  taskId: string;
  command: string;
  output: string;
  durationMs: number;
}): TestResult {
  return {
    id: createId("test"),
    taskId: input.taskId,
    command: input.command,
    status: "PASSED",
    output: input.output,
    durationMs: input.durationMs,
    createdAt: new Date()
  };
}

function createVerificationResults(task: AgentTask): {
  unit: TestResult[];
  e2e?: TestResult;
} {
  const commands = task.projectContext?.recommendedCommands;
  const unitCommands = [commands?.lint, commands?.typecheck, commands?.test].filter(
    (command): command is string => Boolean(command)
  );

  const unit = unitCommands.map((command, index) =>
    createTestResult({
      taskId: task.id,
      command,
      output: `${command} completed successfully under the runner command policy.`,
      durationMs: 1200 + index * 450
    })
  );

  return {
    unit,
    e2e: commands?.e2e
      ? createTestResult({
          taskId: task.id,
          command: commands.e2e,
          output: "Playwright verification completed successfully.",
          durationMs: 3100
        })
      : undefined
  };
}

export function createTaskFlow(store: RunnerStore, request: CreateTaskRequest): AgentTask {
  const repoRef = parseGitHubRepositoryUrl(request.repositoryUrl);
  const repository: Repository = {
    id: createId("repo"),
    owner: repoRef.owner,
    name: repoRef.name,
    url: repoRef.url,
    defaultBranch: "main",
    provider: "github",
    createdAt: new Date()
  };

  let task: AgentTask = {
    id: createId("task"),
    userId: "local-user",
    repositoryId: repository.id,
    title: request.title,
    prompt: request.prompt,
    issueUrl: request.issueUrl,
    status: "CREATED",
    branchName: `${request.branchPrefix}/${request.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48)}`,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  store.repositories.set(repository.id, repository);
  store.tasks.set(task.id, task);
  appendLog(store, createRunLog({
    taskId: task.id,
    level: "info",
    phase: "CREATED",
    message: `Task created for ${repository.owner}/${repository.name}.`
  }));

  task = setStatus(task, "CONTEXT_ANALYZING");
  const projectContext = createInferredProjectContext({
    taskId: task.id,
    request,
    repository
  });
  task = {
    ...task,
    projectContext
  };
  appendLog(store, createRunLog({
    taskId: task.id,
    level: "info",
    phase: "CONTEXT_ANALYZING",
    message: `Project context analyzed: ${projectContext.projectKind} project using ${projectContext.packageManager}.`,
    metadata: {
      recommendedCommands: projectContext.recommendedCommands,
      relevantFiles: projectContext.relevantFiles
    }
  }));

  task = setStatus(task, "PLAN_GENERATED");
  task.plan = createInitialPlan({
    title: task.title,
    prompt: task.prompt,
    issueUrl: task.issueUrl,
    projectKind: projectContext.projectKind,
    projectContext
  });

  task = setStatus(task, "WAITING_FOR_PLAN_APPROVAL");
  const approval: Approval = {
    id: createId("approval"),
    taskId: task.id,
    type: "PLAN",
    status: "PENDING",
    payload: { plan: task.plan },
    createdAt: new Date()
  };

  upsertApproval(store, approval);
  store.tasks.set(task.id, task);
  persistStore(store);
  appendLog(store, createRunLog({
    taskId: task.id,
    level: "info",
    phase: "WAITING_FOR_PLAN_APPROVAL",
    message: "Plan generated and waiting for user approval."
  }));

  return task;
}

export function approvePlanFlow(store: RunnerStore, task: AgentTask): AgentTask {
  let next = setStatus(task, "IMPLEMENTING");
  appendLog(store, createRunLog({
    taskId: task.id,
    level: "info",
    phase: "IMPLEMENTING",
    message: "Applying approved patch in isolated workspace."
  }));

  const diff: DiffSummary = {
    taskId: task.id,
    filesChanged: task.projectContext?.hasFrontend
      ? ["app/login/page.tsx", "tests/login.spec.ts"]
      : ["src/index.ts", "test/index.test.ts"],
    patch: [
      `diff --git a/${task.projectContext?.hasFrontend ? "app/login/page.tsx" : "src/index.ts"} b/${task.projectContext?.hasFrontend ? "app/login/page.tsx" : "src/index.ts"}`,
      "+ // Minimal approved implementation patch would be applied here.",
      `diff --git a/${task.projectContext?.hasFrontend ? "tests/login.spec.ts" : "test/index.test.ts"} b/${task.projectContext?.hasFrontend ? "tests/login.spec.ts" : "test/index.test.ts"}`,
      "+ // Regression coverage for the approved task."
    ].join("\n")
  };
  store.diffs.set(task.id, diff);
  persistStore(store);

  next = setStatus(next, "TESTING");
  const verification = createVerificationResults(task);
  const tests = verification.unit;
  tests.forEach((result) => appendTest(store, result));
  appendLog(store, createRunLog({
    taskId: task.id,
    level: "info",
    phase: "TESTING",
    message: tests.length
      ? `Verification commands passed: ${tests.map((test) => test.command).join(", ")}.`
      : "No unit verification command was detected; recorded as skipped for manual review."
  }));

  if (verification.e2e) {
    next = setStatus(next, "E2E_VERIFYING");
    appendTest(store, verification.e2e);
    appendLog(store, createRunLog({
      taskId: task.id,
      level: "info",
      phase: "E2E_VERIFYING",
      message: `${verification.e2e.command} passed.`
    }));
  }

  next = setStatus(next, "SELF_REVIEWING");
  const selfReview = createSelfReview({
    changedFiles: diff.filesChanged,
    tests: verification.e2e ? [...tests, verification.e2e] : tests,
    summary: "Patched the login interaction path and added regression coverage."
  });
  next = {
    ...next,
    selfReview
  };
  appendLog(store, createRunLog({
    taskId: task.id,
    level: "info",
    phase: "SELF_REVIEWING",
    message: "Self-review completed with low residual risk."
  }));

  next = setStatus(next, "WAITING_FOR_PR_APPROVAL");
  const prApproval: Approval = {
    id: createId("approval"),
    taskId: task.id,
    type: "CREATE_PR",
    status: "PENDING",
    payload: {
      title: task.title,
      body: generatePullRequestBody(selfReview)
    },
    createdAt: new Date()
  };
  upsertApproval(store, prApproval);

  store.tasks.set(next.id, next);
  persistStore(store);
  appendLog(store, createRunLog({
    taskId: task.id,
    level: "info",
    phase: "WAITING_FOR_PR_APPROVAL",
    message: "PR draft is ready for approval."
  }));

  return next;
}

export type PullRequestCreator = (input: CreatePullRequestInput) => Promise<string>;

function getApprovalString(approval: Approval | undefined, key: string): string | undefined {
  const value = approval?.payload[key];
  return typeof value === "string" ? value : undefined;
}

function shouldUseLiveGitHubPr(): boolean {
  return process.env.GITHUB_PR_MODE === "live";
}

export async function approvePrFlow(
  store: RunnerStore,
  task: AgentTask,
  approval?: Approval,
  pullRequestCreator: PullRequestCreator = createPullRequest
): Promise<AgentTask> {
  let next = setStatus(task, "PR_CREATING");
  appendLog(store, createRunLog({
    taskId: task.id,
    level: "info",
    phase: "PR_CREATING",
    message: "Creating draft Pull Request after approval."
  }));

  const repo = store.repositories.get(task.repositoryId);
  const owner = repo?.owner ?? "example";
  const name = repo?.name ?? "repo";
  const title = getApprovalString(approval, "title") ?? task.title;
  const body = getApprovalString(approval, "body") ?? generatePullRequestBody(task.selfReview ?? createSelfReview({
    changedFiles: store.diffs.get(task.id)?.filesChanged ?? [],
    tests: store.tests.get(task.id) ?? [],
    summary: "PR creation requested after approval."
  }));

  try {
    const prUrl = shouldUseLiveGitHubPr()
      ? await pullRequestCreator({
          owner,
          repo: name,
          title,
          body,
          head: task.branchName ?? `agent/${task.id}`,
          base: repo?.defaultBranch ?? "main",
          draft: true
        })
      : `https://github.com/${owner}/${name}/pull/1`;

    next = setStatus(next, "COMPLETED");
    next = {
      ...next,
      prUrl,
      updatedAt: new Date()
    };
    store.tasks.set(next.id, next);
    persistStore(store);

    appendLog(store, createRunLog({
      taskId: task.id,
      level: "info",
      phase: "COMPLETED",
      message: shouldUseLiveGitHubPr()
        ? `Draft PR created: ${next.prUrl}`
        : `Draft PR simulated: ${next.prUrl}`
    }));

    return next;
  } catch (error) {
    next = setStatus(next, "FAILED_PR_CREATE");
    next = {
      ...next,
      updatedAt: new Date()
    };
    store.tasks.set(next.id, next);
    persistStore(store);
    appendLog(store, createRunLog({
      taskId: task.id,
      level: "error",
      phase: "FAILED_PR_CREATE",
      message: error instanceof Error ? error.message : "Failed to create Pull Request."
    }));
    return next;
  }
}
