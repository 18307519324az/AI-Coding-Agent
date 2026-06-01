import { describe, expect, it } from "vitest";
import { createServer } from "../src/server";

describe("runner API", () => {
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
