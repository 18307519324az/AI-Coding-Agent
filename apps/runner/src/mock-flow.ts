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
  Repository,
  TestResult
} from "@ai-coding-agent/shared";
import { appendLog, appendTest, type RunnerStore, upsertApproval } from "./store";
import { createId } from "./ids";
import { createRunLog } from "./log";

function setStatus(task: AgentTask, status: AgentTask["status"]): AgentTask {
  assertTransition(task.status, status);
  const next = {
    ...task,
    status,
    updatedAt: new Date()
  };
  return next;
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
  appendLog(store, createRunLog({
    taskId: task.id,
    level: "info",
    phase: "CONTEXT_ANALYZING",
    message: "Repository metadata queued for analysis."
  }));

  task = setStatus(task, "PLAN_GENERATED");
  task.plan = createInitialPlan({
    title: task.title,
    prompt: task.prompt,
    issueUrl: task.issueUrl,
    projectKind: "typescript-monorepo"
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
    filesChanged: ["src/login.ts", "tests/login.spec.ts"],
    patch: [
      "diff --git a/src/login.ts b/src/login.ts",
      "+ attachSubmitHandler(loginButton, submitLoginForm);",
      "diff --git a/tests/login.spec.ts b/tests/login.spec.ts",
      "+ expect(await loginButton.isEnabled()).toBe(true);"
    ].join("\n")
  };
  store.diffs.set(task.id, diff);

  next = setStatus(next, "TESTING");
  const tests: TestResult[] = [
    {
      id: createId("test"),
      taskId: task.id,
      command: "pnpm lint",
      status: "PASSED",
      output: "Lint completed without errors.",
      durationMs: 1280,
      createdAt: new Date()
    },
    {
      id: createId("test"),
      taskId: task.id,
      command: "pnpm typecheck",
      status: "PASSED",
      output: "TypeScript completed without errors.",
      durationMs: 1904,
      createdAt: new Date()
    },
    {
      id: createId("test"),
      taskId: task.id,
      command: "pnpm test",
      status: "PASSED",
      output: "Unit tests passed.",
      durationMs: 2311,
      createdAt: new Date()
    }
  ];
  tests.forEach((result) => appendTest(store, result));
  appendLog(store, createRunLog({
    taskId: task.id,
    level: "info",
    phase: "TESTING",
    message: "Lint, typecheck, and unit tests passed."
  }));

  next = setStatus(next, "E2E_VERIFYING");
  const e2e: TestResult = {
    id: createId("test"),
    taskId: task.id,
    command: "pnpm test:e2e",
    status: "PASSED",
    output: "Playwright smoke path passed.",
    durationMs: 3412,
    createdAt: new Date()
  };
  appendTest(store, e2e);

  next = setStatus(next, "SELF_REVIEWING");
  const selfReview = createSelfReview({
    changedFiles: diff.filesChanged,
    tests: [...tests, e2e],
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
  appendLog(store, createRunLog({
    taskId: task.id,
    level: "info",
    phase: "WAITING_FOR_PR_APPROVAL",
    message: "PR draft is ready for approval."
  }));

  return next;
}

export function approvePrFlow(store: RunnerStore, task: AgentTask): AgentTask {
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

  next = setStatus(next, "COMPLETED");
  next = {
    ...next,
    prUrl: `https://github.com/${owner}/${name}/pull/1`,
    updatedAt: new Date()
  };
  store.tasks.set(next.id, next);

  appendLog(store, createRunLog({
    taskId: task.id,
    level: "info",
    phase: "COMPLETED",
    message: `Draft PR created: ${next.prUrl}`
  }));

  return next;
}
