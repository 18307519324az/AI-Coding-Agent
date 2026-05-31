import type {
  AgentRunLog,
  AgentTask,
  Approval,
  DiffSummary,
  Repository,
  TestResult
} from "@ai-coding-agent/shared";

export const repositories: Repository[] = [
  {
    id: "repo_1",
    owner: "acme",
    name: "customer-portal",
    url: "https://github.com/acme/customer-portal",
    defaultBranch: "main",
    provider: "github",
    createdAt: new Date("2026-05-30T09:00:00Z")
  },
  {
    id: "repo_2",
    owner: "acme",
    name: "billing-api",
    url: "https://github.com/acme/billing-api",
    defaultBranch: "main",
    provider: "github",
    createdAt: new Date("2026-05-28T12:00:00Z")
  }
];

export const tasks: AgentTask[] = [
  {
    id: "task_login",
    userId: "local-user",
    repositoryId: "repo_1",
    title: "Fix login button click handling",
    prompt: "The login button does not respond when clicked.",
    issueUrl: "https://github.com/acme/customer-portal/issues/12",
    status: "WAITING_FOR_PR_APPROVAL",
    branchName: "agent/fix-login-button",
    plan: {
      summary: "Inspect login form events, patch the submit path, and add Playwright regression coverage.",
      assumptions: ["The issue is reproducible in the local web app."],
      targetFiles: ["apps/web/app/login/page.tsx", "apps/web/tests/login.spec.ts"],
      steps: [
        "Inspect login form component.",
        "Find missing submit handler or disabled state issue.",
        "Patch handler.",
        "Add Playwright regression test.",
        "Run lint, typecheck, unit test, and E2E checks."
      ],
      risks: ["External auth provider behavior may need local mocks."],
      requiresApproval: true
    },
    selfReview: {
      summary: "Updated login submit handling and added regression coverage.",
      changedFiles: ["apps/web/app/login/page.tsx", "apps/web/tests/login.spec.ts"],
      testsRun: [
        { command: "pnpm lint", status: "PASSED" },
        { command: "pnpm typecheck", status: "PASSED" },
        { command: "pnpm test:e2e login.spec.ts", status: "PASSED" }
      ],
      risks: ["Auth provider was mocked locally."],
      recommendation: "Ready for PR review."
    },
    createdAt: new Date("2026-05-31T09:00:00Z"),
    updatedAt: new Date("2026-05-31T09:24:00Z")
  },
  {
    id: "task_allowlist",
    userId: "local-user",
    repositoryId: "repo_2",
    title: "Implement command allowlist",
    prompt: "Block dangerous shell commands and require approval for dependency install and push.",
    status: "TESTING",
    branchName: "agent/command-allowlist",
    createdAt: new Date("2026-05-31T08:10:00Z"),
    updatedAt: new Date("2026-05-31T09:18:00Z")
  },
  {
    id: "task_ui",
    userId: "local-user",
    repositoryId: "repo_1",
    title: "Improve task detail UI states",
    prompt: "Make the task detail page show loading, empty, error, disabled, and success states.",
    status: "COMPLETED",
    branchName: "agent/task-detail-states",
    prUrl: "https://github.com/acme/customer-portal/pull/44",
    createdAt: new Date("2026-05-30T14:00:00Z"),
    updatedAt: new Date("2026-05-30T15:16:00Z")
  }
];

export const approvals: Approval[] = [
  {
    id: "approval_pr",
    taskId: "task_login",
    type: "CREATE_PR",
    status: "PENDING",
    payload: {
      title: "Fix login button click handling"
    },
    createdAt: new Date("2026-05-31T09:23:00Z")
  }
];

export const logs: AgentRunLog[] = [
  {
    id: "log_1",
    taskId: "task_login",
    level: "info",
    phase: "CONTEXT_ANALYZING",
    message: "Located login page, auth submit action, and Playwright coverage.",
    createdAt: new Date("2026-05-31T09:04:00Z")
  },
  {
    id: "log_2",
    taskId: "task_login",
    level: "info",
    phase: "IMPLEMENTING",
    message: "Applied minimal patch to submit handler and disabled state.",
    createdAt: new Date("2026-05-31T09:16:00Z")
  },
  {
    id: "log_3",
    taskId: "task_login",
    level: "info",
    phase: "TESTING",
    message: "lint, typecheck, unit, and Playwright smoke checks passed.",
    createdAt: new Date("2026-05-31T09:22:00Z")
  }
];

export const testResults: TestResult[] = [
  {
    id: "test_1",
    taskId: "task_login",
    command: "pnpm lint",
    status: "PASSED",
    output: "No lint errors.",
    durationMs: 1400,
    createdAt: new Date("2026-05-31T09:19:00Z")
  },
  {
    id: "test_2",
    taskId: "task_login",
    command: "pnpm typecheck",
    status: "PASSED",
    output: "TypeScript completed successfully.",
    durationMs: 1811,
    createdAt: new Date("2026-05-31T09:20:00Z")
  },
  {
    id: "test_3",
    taskId: "task_login",
    command: "pnpm test:e2e login.spec.ts",
    status: "PASSED",
    output: "1 passed.",
    durationMs: 3920,
    createdAt: new Date("2026-05-31T09:22:00Z")
  }
];

export const diffSummary: DiffSummary = {
  taskId: "task_login",
  filesChanged: ["apps/web/app/login/page.tsx", "apps/web/tests/login.spec.ts"],
  patch: [
    "diff --git a/apps/web/app/login/page.tsx b/apps/web/app/login/page.tsx",
    "+ <form onSubmit={handleLoginSubmit}>",
    "+   <button disabled={isSubmitting}>Sign in</button>",
    "",
    "diff --git a/apps/web/tests/login.spec.ts b/apps/web/tests/login.spec.ts",
    "+ await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled();"
  ].join("\n")
};

export function getRepository(repositoryId: string): Repository | undefined {
  return repositories.find((repo) => repo.id === repositoryId);
}

export function getTask(taskId: string): AgentTask | undefined {
  return tasks.find((task) => task.id === taskId);
}

