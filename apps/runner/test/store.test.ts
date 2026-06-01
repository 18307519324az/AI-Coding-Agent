import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createFileBackedStore, createSqliteBackedStore, persistStore } from "../src/store";
import { createServer } from "../src/server";

function testStorePath(name: string, extension = "json"): string {
  return path.join(process.cwd(), "test-results", `${name}-${Date.now()}.${extension}`);
}

describe("runner store persistence", () => {
  it("round-trips persisted records with hydrated dates", () => {
    const filePath = testStorePath("round-trip");
    const store = createFileBackedStore(filePath);

    store.repositories.set("repo_1", {
      id: "repo_1",
      owner: "acme",
      name: "portal",
      url: "https://github.com/acme/portal",
      defaultBranch: "main",
      provider: "github",
      createdAt: new Date("2026-06-01T01:00:00Z")
    });
    persistStore(store);

    const restored = createFileBackedStore(filePath);
    expect(restored.repositories.get("repo_1")?.createdAt).toBeInstanceOf(Date);
    expect(restored.repositories.get("repo_1")).toMatchObject({
      owner: "acme",
      name: "portal"
    });

    store.close?.();
    restored.close?.();
    fs.rmSync(filePath, { force: true });
  });

  it("round-trips persisted records through SQLite", () => {
    const filePath = testStorePath("sqlite-round-trip", "db");
    const store = createSqliteBackedStore(filePath);

    store.repositories.set("repo_1", {
      id: "repo_1",
      owner: "acme",
      name: "portal",
      url: "https://github.com/acme/portal",
      defaultBranch: "main",
      provider: "github",
      createdAt: new Date("2026-06-01T01:00:00Z")
    });
    persistStore(store);

    const restored = createSqliteBackedStore(filePath);
    expect(restored.repositories.get("repo_1")?.createdAt).toBeInstanceOf(Date);
    expect(restored.repositories.get("repo_1")).toMatchObject({
      owner: "acme",
      name: "portal"
    });

    store.close?.();
    restored.close?.();
    fs.rmSync(filePath, { force: true });
  });

  it("persists task flow side effects from the API", async () => {
    const filePath = testStorePath("api-flow");
    const store = createFileBackedStore(filePath);
    const app = createServer(store);

    const response = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: {
        repositoryUrl: "https://github.com/acme/customer-portal",
        title: "Fix login button",
        prompt: "The login button does not respond when clicked.",
        branchPrefix: "agent",
        allowDependencyInstall: false,
        allowCreatePr: false
      }
    });

    expect(response.statusCode).toBe(201);
    const restored = createFileBackedStore(filePath);
    const [task] = [...restored.tasks.values()];
    expect(task).toMatchObject({
      title: "Fix login button",
      status: "WAITING_FOR_PLAN_APPROVAL"
    });
    expect(task.projectContext).toMatchObject({
      hasFrontend: true
    });
    expect(restored.logs.get(task.id)?.length).toBeGreaterThan(0);

    fs.rmSync(filePath, { force: true });
  });
});
