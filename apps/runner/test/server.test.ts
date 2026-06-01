import { describe, expect, it } from "vitest";
import type { ProjectContext } from "@ai-coding-agent/shared";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createServer } from "../src/server";

function createWorkspaceContext(rootPath: string): ProjectContext {
  return {
    rootPath,
    packageManager: "pnpm",
    projectKind: "node",
    hasFrontend: false,
    scripts: {
      lint: "eslint .",
      typecheck: "tsc --noEmit",
      test: "vitest run",
      "test:e2e": "playwright test"
    },
    recommendedCommands: {
      install: "pnpm install",
      lint: "pnpm lint",
      typecheck: "pnpm typecheck",
      test: "pnpm test",
      e2e: "pnpm test:e2e"
    },
    relevantFiles: ["package.json", "src/index.ts", "test/index.test.ts"]
  };
}

describe("runner API", () => {
  it("keeps health public when API key auth is enabled", async () => {
    const app = createServer(undefined, {
      apiKey: "runner-secret"
    });
    const response = await app.inject({
      method: "GET",
      url: "/health"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true
    });
  });

  it("requires a bearer token when API key auth is enabled", async () => {
    const app = createServer(undefined, {
      apiKey: "runner-secret"
    });
    const rejected = await app.inject({
      method: "GET",
      url: "/api/tasks"
    });
    const accepted = await app.inject({
      method: "GET",
      url: "/api/tasks",
      headers: {
        authorization: "Bearer runner-secret"
      }
    });

    expect(rejected.statusCode).toBe(401);
    expect(rejected.json()).toMatchObject({
      error: "Unauthorized."
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toMatchObject({
      tasks: []
    });
  });

  it("returns operational metrics for monitoring", async () => {
    const app = createServer();
    await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: {
        repositoryUrl: "https://github.com/example/repo",
        title: "Fix login button",
        prompt: "The login button does not respond when clicked.",
        branchPrefix: "agent",
        allowDependencyInstall: false,
        allowCreatePr: false
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/metrics"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      service: "runner",
      repositories: 1,
      tasks: {
        total: 1,
        byStatus: {
          WAITING_FOR_PLAN_APPROVAL: 1
        }
      },
      approvals: {
        pending: 1
      }
    });
    expect(response.json<{ logs: number; traces: number; uptimeSeconds: number }>().logs).toBeGreaterThan(0);
    expect(response.json<{ logs: number; traces: number; uptimeSeconds: number }>().traces).toBeGreaterThan(0);
    expect(response.json<{ logs: number; traces: number; uptimeSeconds: number }>().uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it("connects a GitHub repository", async () => {
    const app = createServer();
    const response = await app.inject({
      method: "POST",
      url: "/api/repositories",
      payload: {
        repositoryUrl: "https://github.com/example/repo",
        defaultBranch: "main"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      owner: "example",
      name: "repo",
      defaultBranch: "main"
    });
  });

  it("creates a task and waits for plan approval", async () => {
    const app = createServer();
    const response = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: {
        repositoryUrl: "https://github.com/example/repo",
        title: "Fix login button",
        prompt: "The login button does not respond when clicked.",
        branchPrefix: "agent",
        allowDependencyInstall: false,
        allowCreatePr: false
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      status: "WAITING_FOR_PLAN_APPROVAL"
    });
  });

  it("queues plan generation when job mode is enabled", async () => {
    const app = createServer(undefined, {
      jobMode: "queued"
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: {
        repositoryUrl: "https://github.com/example/repo",
        title: "Fix login button",
        prompt: "The login button does not respond when clicked.",
        branchPrefix: "agent",
        allowDependencyInstall: false,
        allowCreatePr: false
      }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      status: "CREATED",
      jobId: expect.stringMatching(/^job_/)
    });

    const { taskId } = response.json<{ taskId: string }>();
    const beforeProcessing = await app.inject({
      method: "GET",
      url: `/api/tasks/${taskId}`
    });
    const queuedTask = beforeProcessing.json<{
      status: string;
      plan?: unknown;
      jobs: Array<{ maxAttempts: number; status: string; type: string }>;
    }>();
    expect(queuedTask).toMatchObject({
      status: "CREATED",
      jobs: [expect.objectContaining({ maxAttempts: 3, status: "QUEUED", type: "PLAN_TASK" })]
    });
    expect(queuedTask.plan).toBeUndefined();

    const processed = await app.inject({
      method: "POST",
      url: "/api/jobs/process-next"
    });
    expect(processed.statusCode).toBe(200);
    expect(processed.json()).toMatchObject({
      status: "COMPLETED",
      type: "PLAN_TASK"
    });

    const afterProcessing = await app.inject({
      method: "GET",
      url: `/api/tasks/${taskId}`
    });
    expect(afterProcessing.json()).toMatchObject({
      status: "WAITING_FOR_PLAN_APPROVAL",
      plan: expect.objectContaining({ requiresApproval: true }),
      jobs: [expect.objectContaining({ status: "COMPLETED", type: "PLAN_TASK" })]
    });
  });

  it("can create a task using workspace clone and project analysis providers", async () => {
    const clonedInputs: unknown[] = [];
    const app = createServer(undefined, {
      workspaceExecution: true,
      repositoryCloner: async (input) => {
        clonedInputs.push(input);
        return `D:/runner-workspaces/${input.taskId}/repo`;
      },
      projectAnalyzer: async (rootPath) => createWorkspaceContext(rootPath)
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: {
        repositoryUrl: "https://github.com/example/repo",
        title: "Fix API validation",
        prompt: "The API should return a validation error for bad input.",
        branchPrefix: "agent",
        allowDependencyInstall: false,
        allowCreatePr: false
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      status: "WAITING_FOR_PLAN_APPROVAL"
    });
    expect(clonedInputs).toEqual([
      expect.objectContaining({
        repositoryUrl: "https://github.com/example/repo"
      })
    ]);

    const { taskId } = response.json<{ taskId: string }>();
    const detail = await app.inject({
      method: "GET",
      url: `/api/tasks/${taskId}`
    });
    const body = detail.json<{
      logs: Array<{ phase: string }>;
      projectContext: ProjectContext;
    }>();

    expect(body.logs.map((log) => log.phase)).toEqual(
      expect.arrayContaining(["REPO_CLONING", "CONTEXT_ANALYZING", "WAITING_FOR_PLAN_APPROVAL"])
    );
    expect(body.projectContext).toMatchObject({
      rootPath: `D:/runner-workspaces/${taskId}/repo`,
      packageManager: "pnpm",
      projectKind: "node",
      recommendedCommands: {
        lint: "pnpm lint",
        typecheck: "pnpm typecheck",
        test: "pnpm test"
      }
    });
  });

  it("runs workspace verification commands after plan approval", async () => {
    const seenCommands: string[] = [];
    const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "ai-coding-agent-server-"));
    const artifactRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ai-coding-agent-artifacts-"));
    const app = createServer(undefined, {
      workspaceExecution: true,
      repositoryCloner: async () => rootPath,
      projectAnalyzer: async (rootPath) => createWorkspaceContext(rootPath),
      e2eArtifactRoot: artifactRoot,
      commandRunner: async (input) => {
        seenCommands.push(input.command);
        if (input.command === "pnpm test:e2e") {
          await fs.mkdir(path.join(input.cwd, "playwright-report"), { recursive: true });
          await fs.writeFile(path.join(input.cwd, "playwright-report", "index.html"), "<html>report</html>\n");
          await fs.mkdir(path.join(input.cwd, "test-results", "task-detail"), { recursive: true });
          await fs.writeFile(path.join(input.cwd, "test-results", "task-detail", "task-detail.png"), "png");
        }
        return {
          command: input.command,
          status: "PASSED",
          output: input.command === "git diff"
            ? "diff --git a/src/index.ts b/src/index.ts\n+export const fixed = true;\n"
            : `ran ${input.command}`,
          durationMs: 5
        };
      }
    });
    const created = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: {
        repositoryUrl: "https://github.com/example/repo",
        title: "Fix API validation",
        prompt: "The API should return a validation error for bad input.",
        branchPrefix: "agent",
        allowDependencyInstall: false,
        allowCreatePr: false
      }
    });
    const { taskId } = created.json<{ taskId: string }>();
    const detail = await app.inject({
      method: "GET",
      url: `/api/tasks/${taskId}`
    });
    const planApproval = detail.json<{ approvals: Array<{ id: string; type: string }> }>().approvals.find(
      (approval) => approval.type === "PLAN"
    );

    const approved = await app.inject({
      method: "POST",
      url: `/api/tasks/${taskId}/approvals/${planApproval?.id}/approve`
    });

    expect(approved.statusCode).toBe(200);
    expect(approved.json()).toMatchObject({
      status: "WAITING_FOR_PR_APPROVAL"
    });
    expect(seenCommands).toEqual(["git diff", "pnpm lint", "pnpm typecheck", "pnpm test", "pnpm test:e2e"]);

    const afterApproval = await app.inject({
      method: "GET",
      url: `/api/tasks/${taskId}`
    });
    const body = afterApproval.json<{
      diff: { filesChanged: string[] };
      e2eArtifacts: Array<{ command: string; reportUrl: string; screenshots: Array<{ path: string }> }>;
      tests: Array<{ command: string; output: string; status: string }>;
      traces: Array<{ phase: string; summary: string; type: string }>;
    }>();

    expect(body.diff.filesChanged).toEqual(["src/index.ts"]);
    expect(body.traces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "STATE", phase: "IMPLEMENTING", summary: "WAITING_FOR_PLAN_APPROVAL -> IMPLEMENTING" }),
        expect.objectContaining({ type: "STATE", phase: "TESTING", summary: "IMPLEMENTING -> TESTING" }),
        expect.objectContaining({ type: "STATE", phase: "E2E_VERIFYING", summary: "TESTING -> E2E_VERIFYING" }),
        expect.objectContaining({ type: "STATE", phase: "WAITING_FOR_PR_APPROVAL", summary: "SELF_REVIEWING -> WAITING_FOR_PR_APPROVAL" })
      ])
    );
    expect(body.tests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ command: "pnpm lint", output: "ran pnpm lint", status: "PASSED" }),
        expect.objectContaining({ command: "pnpm typecheck", output: "ran pnpm typecheck", status: "PASSED" }),
        expect.objectContaining({ command: "pnpm test", output: "ran pnpm test", status: "PASSED" }),
        expect.objectContaining({ command: "pnpm test:e2e", output: "ran pnpm test:e2e", status: "PASSED" })
      ])
    );
    expect(body.e2eArtifacts).toEqual([
      expect.objectContaining({
        command: "pnpm test:e2e",
        reportUrl: expect.stringContaining("playwright-report/index.html"),
        screenshots: [expect.objectContaining({ path: expect.stringContaining("task-detail.png") })]
      })
    ]);
    await expect(fs.readFile(body.e2eArtifacts[0].reportUrl, "utf8")).resolves.toContain("report");
    await expect(fs.readFile(body.e2eArtifacts[0].screenshots[0].path, "utf8")).resolves.toBe("png");
  });

  it("stops a workspace task when a verification command fails", async () => {
    const app = createServer(undefined, {
      workspaceExecution: true,
      repositoryCloner: async (input) => `D:/runner-workspaces/${input.taskId}/repo`,
      projectAnalyzer: async (rootPath) => createWorkspaceContext(rootPath),
      commandRunner: async (input) => ({
        command: input.command,
        status: input.command === "pnpm test" ? "FAILED" : "PASSED",
        output: input.command === "pnpm test" ? "unit test failed" : "",
        durationMs: 5
      })
    });
    const created = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: {
        repositoryUrl: "https://github.com/example/repo",
        title: "Fix API validation",
        prompt: "The API should return a validation error for bad input.",
        branchPrefix: "agent",
        allowDependencyInstall: false,
        allowCreatePr: false
      }
    });
    const { taskId } = created.json<{ taskId: string }>();
    const detail = await app.inject({
      method: "GET",
      url: `/api/tasks/${taskId}`
    });
    const planApproval = detail.json<{ approvals: Array<{ id: string; type: string }> }>().approvals.find(
      (approval) => approval.type === "PLAN"
    );

    const approved = await app.inject({
      method: "POST",
      url: `/api/tasks/${taskId}/approvals/${planApproval?.id}/approve`
    });

    expect(approved.statusCode).toBe(200);
    expect(approved.json()).toMatchObject({
      status: "FAILED_TEST"
    });

    const afterApproval = await app.inject({
      method: "GET",
      url: `/api/tasks/${taskId}`
    });
    const body = afterApproval.json<{
      approvals: Array<{ type: string; status: string }>;
      tests: Array<{ command: string; status: string; output: string }>;
    }>();

    expect(body.approvals).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "CREATE_PR", status: "PENDING" })])
    );
    expect(body.tests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ command: "pnpm test", status: "FAILED", output: "unit test failed" })
      ])
    );
  });

  it("creates a task from a GitHub issue URL when title and prompt are omitted", async () => {
    const app = createServer(undefined, {
      issueFetcher: async () => ({
        title: "Fix issue title from GitHub",
        body: "The issue body becomes the task prompt.",
        issueNumber: 42,
        url: "https://github.com/example/repo/issues/42",
        repositoryUrl: "https://github.com/example/repo"
      })
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: {
        repositoryUrl: "https://github.com/example/repo",
        issueUrl: "https://github.com/example/repo/issues/42",
        branchPrefix: "agent",
        allowDependencyInstall: false,
        allowCreatePr: false
      }
    });

    expect(response.statusCode).toBe(201);
    const { taskId } = response.json<{ taskId: string }>();
    const detail = await app.inject({
      method: "GET",
      url: `/api/tasks/${taskId}`
    });

    expect(detail.json()).toMatchObject({
      title: "Fix issue title from GitHub",
      prompt: expect.stringContaining("The issue body becomes the task prompt."),
      issueUrl: "https://github.com/example/repo/issues/42",
      status: "WAITING_FOR_PLAN_APPROVAL"
    });
  });

  it("redacts tokens in stored logs", async () => {
    const app = createServer();
    const created = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: {
        repositoryUrl: "https://github.com/example/repo",
        title: "Fix token leak",
        prompt: "Make sure logs do not expose GitHub tokens.",
        branchPrefix: "agent",
        allowDependencyInstall: false,
        allowCreatePr: false
      }
    });

    const { taskId } = created.json<{ taskId: string }>();
    const logs = await app.inject({
      method: "GET",
      url: `/api/tasks/${taskId}/logs`
    });

    expect(JSON.stringify(logs.json())).not.toContain("ghp_");
  });

  it("approves a plan and creates a pending PR approval", async () => {
    const app = createServer();
    const created = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: {
        repositoryUrl: "https://github.com/example/repo",
        title: "Fix login button",
        prompt: "The login button does not respond when clicked.",
        branchPrefix: "agent",
        allowDependencyInstall: false,
        allowCreatePr: false
      }
    });
    const { taskId } = created.json<{ taskId: string }>();

    const detail = await app.inject({
      method: "GET",
      url: `/api/tasks/${taskId}`
    });
    const planApproval = detail.json<{ approvals: Array<{ id: string; type: string }> }>().approvals.find(
      (approval) => approval.type === "PLAN"
    );

    expect(planApproval).toBeDefined();

    const approved = await app.inject({
      method: "POST",
      url: `/api/tasks/${taskId}/approvals/${planApproval?.id}/approve`
    });

    expect(approved.statusCode).toBe(200);
    expect(approved.json()).toMatchObject({
      status: "WAITING_FOR_PR_APPROVAL"
    });

    const afterApproval = await app.inject({
      method: "GET",
      url: `/api/tasks/${taskId}`
    });
    const body = afterApproval.json<{
      approvals: Array<{ type: string; status: string }>;
      diff: { filesChanged: string[] };
      e2eArtifacts: Array<{ command: string; reportUrl: string }>;
      projectContext: { hasFrontend: boolean; recommendedCommands: { e2e?: string } };
      tests: Array<{ command: string; status: string }>;
    }>();

    expect(body.approvals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "CREATE_PR", status: "PENDING" })
      ])
    );
    expect(body.projectContext).toMatchObject({
      hasFrontend: true,
      recommendedCommands: {
        e2e: "pnpm test:e2e"
      }
    });
    expect(body.diff.filesChanged).toContain("app/login/page.tsx");
    expect(body.tests.map((test) => test.command)).toEqual(
      expect.arrayContaining(["pnpm lint", "pnpm typecheck", "pnpm test", "pnpm test:e2e"])
    );
    expect(body.tests.every((test) => test.status === "PASSED")).toBe(true);
    expect(body.e2eArtifacts).toEqual([
      expect.objectContaining({
        command: "pnpm test:e2e",
        reportUrl: expect.stringContaining("playwright-report/index.html")
      })
    ]);
  });

  it("approves PR creation after the PR approval gate", async () => {
    const app = createServer();
    const created = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: {
        repositoryUrl: "https://github.com/example/repo",
        title: "Fix login button",
        prompt: "The login button does not respond when clicked.",
        branchPrefix: "agent",
        allowDependencyInstall: false,
        allowCreatePr: false
      }
    });
    const { taskId } = created.json<{ taskId: string }>();
    const detail = await app.inject({
      method: "GET",
      url: `/api/tasks/${taskId}`
    });
    const planApproval = detail.json<{ approvals: Array<{ id: string; type: string }> }>().approvals.find(
      (approval) => approval.type === "PLAN"
    );

    await app.inject({
      method: "POST",
      url: `/api/tasks/${taskId}/approvals/${planApproval?.id}/approve`
    });

    const readyForPr = await app.inject({
      method: "GET",
      url: `/api/tasks/${taskId}`
    });
    const prApproval = readyForPr.json<{ approvals: Array<{ id: string; type: string }> }>().approvals.find(
      (approval) => approval.type === "CREATE_PR"
    );

    const approved = await app.inject({
      method: "POST",
      url: `/api/tasks/${taskId}/approvals/${prApproval?.id}/approve`
    });

    expect(approved.statusCode).toBe(200);
    expect(approved.json()).toMatchObject({
      status: "COMPLETED",
      prUrl: "https://github.com/example/repo/pull/1"
    });
  });

  it("publishes the branch before live PR creation", async () => {
    const previousMode = process.env.GITHUB_PR_MODE;
    process.env.GITHUB_PR_MODE = "live";
    try {
      const publishedBranches: unknown[] = [];
      const createdPullRequests: unknown[] = [];
      const app = createServer(undefined, {
        branchPublisher: async (input) => {
          publishedBranches.push(input);
        },
        pullRequestCreator: async (input) => {
          createdPullRequests.push(input);
          return "https://github.com/example/repo/pull/12";
        }
      });
      const created = await app.inject({
        method: "POST",
        url: "/api/tasks",
        payload: {
          repositoryUrl: "https://github.com/example/repo",
          title: "Fix login button",
          prompt: "The login button does not respond when clicked.",
          branchPrefix: "agent",
          allowDependencyInstall: false,
          allowCreatePr: false
        }
      });
      const { taskId } = created.json<{ taskId: string }>();
      const detail = await app.inject({
        method: "GET",
        url: `/api/tasks/${taskId}`
      });
      const planApproval = detail.json<{ approvals: Array<{ id: string; type: string }> }>().approvals.find(
        (approval) => approval.type === "PLAN"
      );

      await app.inject({
        method: "POST",
        url: `/api/tasks/${taskId}/approvals/${planApproval?.id}/approve`
      });

      const readyForPr = await app.inject({
        method: "GET",
        url: `/api/tasks/${taskId}`
      });
      const readyBody = readyForPr.json<{
        approvals: Array<{ id: string; type: string }>;
        branchName: string;
        projectContext: { rootPath: string };
      }>();
      const prApproval = readyBody.approvals.find((approval) => approval.type === "CREATE_PR");

      const approved = await app.inject({
        method: "POST",
        url: `/api/tasks/${taskId}/approvals/${prApproval?.id}/approve`
      });

      expect(approved.statusCode).toBe(200);
      expect(approved.json()).toMatchObject({
        status: "COMPLETED",
        prUrl: "https://github.com/example/repo/pull/12"
      });
      expect(publishedBranches).toEqual([
        expect.objectContaining({
          cwd: readyBody.projectContext.rootPath,
          branchName: readyBody.branchName,
          commitMessage: "Fix login button"
        })
      ]);
      expect(createdPullRequests).toEqual([
        expect.objectContaining({
          owner: "example",
          repo: "repo",
          head: readyBody.branchName,
          draft: true
        })
      ]);
    } finally {
      if (previousMode === undefined) {
        delete process.env.GITHUB_PR_MODE;
      } else {
        process.env.GITHUB_PR_MODE = previousMode;
      }
    }
  });

  it("rejects an approval and cancels the task", async () => {
    const app = createServer();
    const created = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: {
        repositoryUrl: "https://github.com/example/repo",
        title: "Avoid auth provider changes",
        prompt: "Fix the issue without touching the auth provider.",
        branchPrefix: "agent",
        allowDependencyInstall: false,
        allowCreatePr: false
      }
    });
    const { taskId } = created.json<{ taskId: string }>();
    const detail = await app.inject({
      method: "GET",
      url: `/api/tasks/${taskId}`
    });
    const planApproval = detail.json<{ approvals: Array<{ id: string; type: string }> }>().approvals.find(
      (approval) => approval.type === "PLAN"
    );

    const rejected = await app.inject({
      method: "POST",
      url: `/api/tasks/${taskId}/approvals/${planApproval?.id}/reject`,
      payload: {
        reason: "Please narrow the plan first."
      }
    });

    expect(rejected.statusCode).toBe(200);
    expect(rejected.json()).toMatchObject({
      status: "CANCELLED"
    });
  });
});
