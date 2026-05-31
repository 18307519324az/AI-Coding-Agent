import { describe, expect, it } from "vitest";
import { createServer } from "../src/server";

describe("runner API", () => {
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
});

