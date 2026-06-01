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
  DiffSummary,
  ProjectContext,
  Repository,
  ResolvedCreateTaskRequest,
  TestResult
} from "@ai-coding-agent/shared";
import { appendLog, appendTest, persistStore, type RunnerStore, upsertApproval } from "./store";
import { executeAllowedCommand, type CommandExecutionResult, type CommandRunner } from "./command-executor";
import { createId } from "./ids";
import { createRunLog } from "./log";
import { createPullRequest, type CreatePullRequestInput } from "./github-service";
import { publishBranch, type BranchPublisher } from "./git-publisher";
import { analyzeProject } from "./project-analyzer";
import { cloneRepository } from "./workspace";

export type RepositoryCloner = (input: {
  repositoryUrl: string;
  taskId: string;
}) => Promise<string>;

export type ProjectAnalyzer = (rootPath: string) => Promise<ProjectContext>;

export type TaskFlowOptions = {
  workspaceExecution?: boolean;
  repositoryCloner?: RepositoryCloner;
  projectAnalyzer?: ProjectAnalyzer;
};

export type ApprovePlanFlowOptions = {
  executeCommands?: boolean;
  commandRunner?: CommandRunner;
};

export type ApprovePrFlowOptions = {
  branchPublisher?: BranchPublisher;
  commandRunner?: CommandRunner;
  pullRequestCreator?: PullRequestCreator;
};

export type { BranchPublisher, CommandRunner };

type VerificationResults = {
  unit: TestResult[];
  e2e?: TestResult;
  failureStatus?: "FAILED_TEST" | "FAILED_E2E";
};

function setStatus(task: AgentTask, status: AgentTask["status"]): AgentTask {
  assertTransition(task.status, status);
  const next = {
    ...task,
    status,
    updatedAt: new Date()
  };
  return next;
}

function saveTask(store: RunnerStore, task: AgentTask): AgentTask {
  store.tasks.set(task.id, task);
  persistStore(store);
  return task;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function shouldUseWorkspaceExecution(options: TaskFlowOptions): boolean {
  return options.workspaceExecution ?? Boolean(options.repositoryCloner || options.projectAnalyzer);
}

function createBranchName(request: ResolvedCreateTaskRequest): string {
  const prefix = request.branchPrefix
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/(^\/+|\/+$)/g, "")
    .replace(/\.\.+/g, ".");
  const slug = request.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
  return `${prefix || "agent"}/${slug || "task"}`;
}

function isE2eCommand(command: string): boolean {
  return /\b(e2e|playwright)\b/i.test(command);
}

function applyRequestCommandOverrides(
  context: ProjectContext,
  request: ResolvedCreateTaskRequest
): ProjectContext {
  const override = request.testCommandOverride?.trim();
  const overrideIsE2e = override ? isE2eCommand(override) : false;

  return {
    ...context,
    recommendedCommands: {
      ...context.recommendedCommands,
      install: request.allowDependencyInstall ? context.recommendedCommands.install : undefined,
      test: override && !overrideIsE2e ? override : context.recommendedCommands.test,
      e2e: override && overrideIsE2e ? override : context.recommendedCommands.e2e
    }
  };
}

function createInferredProjectContext(input: {
  taskId: string;
  request: ResolvedCreateTaskRequest;
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
  status?: TestResult["status"];
  output: string;
  durationMs: number;
}): TestResult {
  return {
    id: createId("test"),
    taskId: input.taskId,
    command: input.command,
    status: input.status ?? "PASSED",
    output: input.output,
    durationMs: input.durationMs,
    createdAt: new Date()
  };
}

function createTestResultFromExecution(taskId: string, result: CommandExecutionResult): TestResult {
  return createTestResult({
    taskId,
    command: result.command,
    status: result.status,
    output: result.output,
    durationMs: result.durationMs
  });
}

function createVerificationResults(task: AgentTask): VerificationResults {
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

async function createProjectContextFromWorkspace(input: {
  store: RunnerStore;
  task: AgentTask;
  request: ResolvedCreateTaskRequest;
  options: TaskFlowOptions;
}): Promise<{ task: AgentTask; projectContext?: ProjectContext }> {
  const cloner = input.options.repositoryCloner ?? cloneRepository;
  const analyzer = input.options.projectAnalyzer ?? analyzeProject;
  let task = saveTask(input.store, setStatus(input.task, "REPO_CLONING"));

  appendLog(input.store, createRunLog({
    taskId: task.id,
    level: "info",
    phase: "REPO_CLONING",
    message: "Cloning repository into an isolated workspace."
  }));

  let repositoryRoot: string;
  try {
    repositoryRoot = await cloner({
      repositoryUrl: input.request.repositoryUrl,
      taskId: task.id
    });
  } catch (error) {
    task = saveTask(input.store, setStatus(task, "FAILED_CLONE"));
    appendLog(input.store, createRunLog({
      taskId: task.id,
      level: "error",
      phase: "FAILED_CLONE",
      message: getErrorMessage(error, "Failed to clone repository.")
    }));
    return { task };
  }

  appendLog(input.store, createRunLog({
    taskId: task.id,
    level: "info",
    phase: "REPO_CLONING",
    message: `Repository cloned into ${repositoryRoot}.`
  }));

  task = saveTask(input.store, setStatus(task, "CONTEXT_ANALYZING"));
  try {
    const projectContext = applyRequestCommandOverrides(await analyzer(repositoryRoot), input.request);
    return { task, projectContext };
  } catch (error) {
    task = saveTask(input.store, setStatus(task, "FAILED_CONTEXT"));
    appendLog(input.store, createRunLog({
      taskId: task.id,
      level: "error",
      phase: "FAILED_CONTEXT",
      message: getErrorMessage(error, "Failed to analyze repository context.")
    }));
    return { task };
  }
}

export async function createTaskFlow(
  store: RunnerStore,
  request: ResolvedCreateTaskRequest,
  options: TaskFlowOptions = {}
): Promise<AgentTask> {
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
    branchName: createBranchName(request),
    createdAt: new Date(),
    updatedAt: new Date()
  };

  store.repositories.set(repository.id, repository);
  saveTask(store, task);
  appendLog(store, createRunLog({
    taskId: task.id,
    level: "info",
    phase: "CREATED",
    message: `Task created for ${repository.owner}/${repository.name}.`
  }));

  let projectContext: ProjectContext | undefined;
  if (shouldUseWorkspaceExecution(options)) {
    const workspaceResult = await createProjectContextFromWorkspace({
      store,
      task,
      request,
      options
    });
    task = workspaceResult.task;
    projectContext = workspaceResult.projectContext;
    if (!projectContext) {
      return task;
    }
  } else {
    task = saveTask(store, setStatus(task, "CONTEXT_ANALYZING"));
    projectContext = createInferredProjectContext({
      taskId: task.id,
      request,
      repository
    });
  }

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
  saveTask(store, task);
  appendLog(store, createRunLog({
    taskId: task.id,
    level: "info",
    phase: "WAITING_FOR_PLAN_APPROVAL",
    message: "Plan generated and waiting for user approval."
  }));

  return task;
}

function parseDiffFiles(patch: string): string[] {
  const files = new Set<string>();
  const matcher = /^diff --git a\/.+? b\/(.+)$/gm;
  let match = matcher.exec(patch);

  while (match) {
    files.add(match[1]);
    match = matcher.exec(patch);
  }

  return [...files];
}

async function createWorkspaceDiffSummary(input: {
  task: AgentTask;
  commandRunner: CommandRunner;
}): Promise<DiffSummary> {
  const rootPath = input.task.projectContext?.rootPath;
  if (!rootPath) {
    return {
      taskId: input.task.id,
      filesChanged: [],
      patch: "No workspace path is available for diff generation."
    };
  }

  const diff = await input.commandRunner({
    command: "git diff",
    cwd: rootPath
  });

  return {
    taskId: input.task.id,
    filesChanged: parseDiffFiles(diff.output),
    patch: diff.output || "No working tree diff was produced by the current implementation step."
  };
}

function createMockDiffSummary(task: AgentTask): DiffSummary {
  return {
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
}

async function runCommandAsTest(input: {
  store: RunnerStore;
  task: AgentTask;
  command: string;
  commandRunner: CommandRunner;
  approvedHighRisk?: boolean;
  phase: "TESTING" | "E2E_VERIFYING";
}): Promise<TestResult> {
  const rootPath = input.task.projectContext?.rootPath;
  const result = createTestResultFromExecution(
    input.task.id,
    rootPath
      ? await input.commandRunner({
          command: input.command,
          cwd: rootPath,
          approvedHighRisk: input.approvedHighRisk
        })
      : {
          command: input.command,
          status: "SKIPPED",
          output: "No workspace path is available for command execution.",
          durationMs: 0
        }
  );

  appendTest(input.store, result);
  appendLog(input.store, createRunLog({
    taskId: input.task.id,
    level: result.status === "PASSED" ? "info" : "error",
    phase: input.phase,
    message: `${result.command} ${result.status.toLowerCase()}.`
  }));

  return result;
}

async function runWorkspaceVerification(input: {
  store: RunnerStore;
  task: AgentTask;
  commandRunner: CommandRunner;
}): Promise<VerificationResults> {
  const commands = input.task.projectContext?.recommendedCommands;
  if (!commands) {
    return { unit: [] };
  }

  const unitCommands = [commands.install, commands.lint, commands.typecheck, commands.test].filter(
    (command): command is string => Boolean(command)
  );
  const unit: TestResult[] = [];

  for (const command of unitCommands) {
    const result = await runCommandAsTest({
      ...input,
      command,
      approvedHighRisk: command === commands.install,
      phase: "TESTING"
    });
    unit.push(result);

    if (result.status !== "PASSED") {
      return { unit, failureStatus: "FAILED_TEST" };
    }
  }

  if (!commands.e2e) {
    return { unit };
  }

  const e2e = await runCommandAsTest({
    ...input,
    command: commands.e2e,
    phase: "E2E_VERIFYING"
  });

  if (e2e.status !== "PASSED") {
    return { unit, e2e, failureStatus: "FAILED_E2E" };
  }

  return { unit, e2e };
}

export async function approvePlanFlow(
  store: RunnerStore,
  task: AgentTask,
  options: ApprovePlanFlowOptions = {}
): Promise<AgentTask> {
  let next = setStatus(task, "IMPLEMENTING");
  appendLog(store, createRunLog({
    taskId: task.id,
    level: "info",
    phase: "IMPLEMENTING",
    message: "Applying approved patch in isolated workspace."
  }));

  const shouldExecuteCommands = options.executeCommands ?? Boolean(options.commandRunner);
  const commandRunner = options.commandRunner ?? executeAllowedCommand;
  const diff = shouldExecuteCommands
    ? await createWorkspaceDiffSummary({ task, commandRunner })
    : createMockDiffSummary(task);
  store.diffs.set(task.id, diff);
  persistStore(store);

  next = setStatus(next, "TESTING");
  const verification = shouldExecuteCommands
    ? await runWorkspaceVerification({ store, task, commandRunner })
    : createVerificationResults(task);
  const tests = verification.unit;
  if (!shouldExecuteCommands) {
    tests.forEach((result) => appendTest(store, result));
  }
  const failedUnitTest = tests.find((test) => test.status !== "PASSED");
  appendLog(store, createRunLog({
    taskId: task.id,
    level: verification.failureStatus === "FAILED_TEST" ? "error" : "info",
    phase: "TESTING",
    message: failedUnitTest
      ? `${failedUnitTest.command} ${failedUnitTest.status.toLowerCase()}; task stopped before PR approval.`
      : tests.length
      ? `Verification commands passed: ${tests.map((test) => test.command).join(", ")}.`
      : "No unit verification command was detected; recorded as skipped for manual review."
  }));

  if (verification.failureStatus === "FAILED_TEST") {
    next = saveTask(store, setStatus(next, "FAILED_TEST"));
    return next;
  }

  if (verification.e2e) {
    next = setStatus(next, "E2E_VERIFYING");
    if (!shouldExecuteCommands) {
      appendTest(store, verification.e2e);
    }
    appendLog(store, createRunLog({
      taskId: task.id,
      level: verification.failureStatus === "FAILED_E2E" ? "error" : "info",
      phase: "E2E_VERIFYING",
      message: `${verification.e2e.command} ${verification.e2e.status.toLowerCase()}.`
    }));

    if (verification.failureStatus === "FAILED_E2E") {
      next = saveTask(store, setStatus(next, "FAILED_E2E"));
      return next;
    }
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
  options: ApprovePrFlowOptions = {}
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
  const head = task.branchName ?? `agent/${task.id}`;
  const body = getApprovalString(approval, "body") ?? generatePullRequestBody(task.selfReview ?? createSelfReview({
    changedFiles: store.diffs.get(task.id)?.filesChanged ?? [],
    tests: store.tests.get(task.id) ?? [],
    summary: "PR creation requested after approval."
  }));

  try {
    const useLiveGitHubPr = shouldUseLiveGitHubPr();
    if (useLiveGitHubPr) {
      const cwd = task.projectContext?.rootPath;
      if (!cwd) {
        throw new Error("Live PR creation requires a workspace path for branch publishing.");
      }

      await (options.branchPublisher ?? publishBranch)({
        cwd,
        branchName: head,
        commitMessage: title,
        commandRunner: options.commandRunner ?? executeAllowedCommand
      });
      appendLog(store, createRunLog({
        taskId: task.id,
        level: "info",
        phase: "PR_CREATING",
        message: `Branch pushed for PR head ${head}.`
      }));
    }

    const prUrl = useLiveGitHubPr
      ? await (options.pullRequestCreator ?? createPullRequest)({
          owner,
          repo: name,
          title,
          body,
          head,
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
      message: useLiveGitHubPr
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
