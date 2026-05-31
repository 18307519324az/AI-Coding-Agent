import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeProject } from "../src/project-analyzer";
import { assertPathInside, getTaskWorkspacePaths } from "../src/workspace-policy";

async function createFixture(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ai-coding-agent-fixture-"));
  await fs.writeFile(
    path.join(root, "package.json"),
    JSON.stringify(
      {
        packageManager: "pnpm@10.12.1",
        scripts: {
          lint: "eslint .",
          typecheck: "tsc --noEmit",
          test: "vitest run",
          "test:e2e": "playwright test"
        },
        dependencies: {
          next: "15.3.3",
          react: "19.1.0"
        },
        devDependencies: {
          typescript: "5.8.3"
        }
      },
      null,
      2
    )
  );
  await fs.writeFile(path.join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  await fs.writeFile(path.join(root, "playwright.config.ts"), "export default {};\n");
  await fs.mkdir(path.join(root, "apps", "web"), { recursive: true });
  await fs.writeFile(path.join(root, "apps", "web", "page.tsx"), "export default function Page() { return null; }\n");
  return root;
}

describe("analyzeProject", () => {
  it("detects package manager, frontend kind, scripts, and relevant files", async () => {
    const root = await createFixture();
    const context = await analyzeProject(root);

    expect(context.packageManager).toBe("pnpm");
    expect(context.projectKind).toBe("next");
    expect(context.hasFrontend).toBe(true);
    expect(context.recommendedCommands).toMatchObject({
      install: "pnpm install",
      lint: "pnpm lint",
      typecheck: "pnpm typecheck",
      test: "pnpm test",
      e2e: "pnpm test:e2e"
    });
    expect(context.relevantFiles).toEqual(
      expect.arrayContaining(["package.json", "playwright.config.ts", "apps/web/page.tsx"])
    );
  });
});

describe("workspace policy", () => {
  it("creates task-scoped paths inside the workspace root", () => {
    const paths = getTaskWorkspacePaths({
      workspaceRoot: path.join(os.tmpdir(), "ai-coding-agent-workspaces"),
      taskId: "task_123"
    });

    expect(paths.repository.endsWith(path.join("task_123", "repo"))).toBe(true);
  });

  it("rejects path traversal", () => {
    expect(() =>
      getTaskWorkspacePaths({
        workspaceRoot: path.join(os.tmpdir(), "ai-coding-agent-workspaces"),
        taskId: "../escape"
      })
    ).toThrow("Invalid task id");
  });

  it("rejects resolved paths outside the root", () => {
    const workspaceRoot = path.join(os.tmpdir(), "ai-coding-agent-root");
    const outsidePath = path.join(os.tmpdir(), "ai-coding-agent-outside", "repo");

    expect(() => assertPathInside(workspaceRoot, outsidePath)).toThrow("escapes allowed root");
  });
});
