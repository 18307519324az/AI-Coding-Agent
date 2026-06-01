import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { approvePlanFlow, approvePrFlow, createTaskFlow } from "../src/mock-flow";
import { createStore, listTaskApprovals } from "../src/store";

describe("mock task flow", () => {
  it("fails the task when plan generation fails", async () => {
    const store = createStore();
    const task = await createTaskFlow(store, {
      repositoryUrl: "https://github.com/acme/customer-portal",
      title: "Fix login button",
      prompt: "The login button does not respond when clicked.",
      branchPrefix: "agent",
      allowDependencyInstall: false,
      allowCreatePr: false
    }, {
      planGenerator: async () => {
        throw new Error("model unavailable");
      }
    });

    expect(task.status).toBe("FAILED_CONTEXT");
    expect(store.logs.get(task.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          phase: "FAILED_CONTEXT",
          message: "model unavailable"
        })
      ])
    );
  });

  it("applies generated implementation edits before verification", async () => {
    const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "ai-coding-agent-flow-"));
    await fs.mkdir(path.join(rootPath, "src"), { recursive: true });
    await fs.writeFile(path.join(rootPath, "src", "index.ts"), "export const value = false;\n");
    const store = createStore();
    const task = await createTaskFlow(store, {
      repositoryUrl: "https://github.com/acme/customer-portal",
      title: "Fix source value",
      prompt: "Flip the exported source value from false to true.",
      branchPrefix: "agent",
      allowDependencyInstall: false,
      allowCreatePr: false
    }, {
      workspaceExecution: true,
      repositoryCloner: async () => rootPath,
      projectAnalyzer: async () => ({
        rootPath,
        packageManager: "pnpm",
        projectKind: "node",
        hasFrontend: false,
        scripts: { test: "vitest run" },
        recommendedCommands: { test: "pnpm test" },
        relevantFiles: ["src/index.ts"]
      })
    });

    const readyForPr = await approvePlanFlow(store, task, {
      implementationGenerator: async () => ({
        summary: "Updated source value.",
        edits: [{ path: "src/index.ts", content: "export const value = true;\n" }],
        risks: []
      }),
      commandRunner: async (input) => ({
        command: input.command,
        status: "PASSED",
        output: input.command === "git diff"
          ? "diff --git a/src/index.ts b/src/index.ts\n-export const value = false;\n+export const value = true;\n"
          : "",
        durationMs: 1
      })
    });

    await expect(fs.readFile(path.join(rootPath, "src", "index.ts"), "utf8")).resolves.toBe(
      "export const value = true;\n"
    );
    expect(readyForPr.status).toBe("WAITING_FOR_PR_APPROVAL");
    expect(store.diffs.get(task.id)?.filesChanged).toEqual(["src/index.ts"]);
  });

  it("uses the live GitHub PR creator only when live mode is enabled", async () => {
    const previousMode = process.env.GITHUB_PR_MODE;
    process.env.GITHUB_PR_MODE = "live";
    try {
      const store = createStore();
      const task = await createTaskFlow(store, {
        repositoryUrl: "https://github.com/acme/customer-portal",
        title: "Fix login button",
        prompt: "The login button does not respond when clicked.",
        branchPrefix: "agent",
        allowDependencyInstall: false,
        allowCreatePr: false
      });
      const readyForPr = await approvePlanFlow(store, task);
      const approval = listTaskApprovals(store, readyForPr.id).find((item) => item.type === "CREATE_PR");
      const seenInputs: unknown[] = [];
      const publishedBranches: unknown[] = [];

      const completed = await approvePrFlow(store, readyForPr, approval, {
        branchPublisher: async (input) => {
          publishedBranches.push(input);
        },
        pullRequestCreator: async (input) => {
          seenInputs.push(input);
          return "https://github.com/acme/customer-portal/pull/7";
        }
      });

      expect(completed).toMatchObject({
        status: "COMPLETED",
        prUrl: "https://github.com/acme/customer-portal/pull/7"
      });
      expect(publishedBranches).toEqual([
        expect.objectContaining({
          cwd: readyForPr.projectContext?.rootPath,
          branchName: readyForPr.branchName,
          commitMessage: "Fix login button"
        })
      ]);
      expect(seenInputs).toEqual([
        expect.objectContaining({
          owner: "acme",
          repo: "customer-portal",
          title: "Fix login button",
          head: readyForPr.branchName,
          base: "main",
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

  it("redacts secrets from live PR creation failures", async () => {
    const previousMode = process.env.GITHUB_PR_MODE;
    process.env.GITHUB_PR_MODE = "live";
    try {
      const store = createStore();
      const task = await createTaskFlow(store, {
        repositoryUrl: "https://github.com/acme/customer-portal",
        title: "Fix login button",
        prompt: "The login button does not respond when clicked.",
        branchPrefix: "agent",
        allowDependencyInstall: false,
        allowCreatePr: false
      });
      const readyForPr = await approvePlanFlow(store, task);
      const approval = listTaskApprovals(store, readyForPr.id).find((item) => item.type === "CREATE_PR");

      const failed = await approvePrFlow(store, readyForPr, approval, {
        branchPublisher: async () => undefined,
        pullRequestCreator: async () => {
          throw new Error("GitHub rejected token=github_pat_1234567890abcdefghijklmnop");
        }
      });

      expect(failed.status).toBe("FAILED_PR_CREATE");
      expect(JSON.stringify(store.logs.get(task.id))).not.toContain("github_pat_");
      expect(store.logs.get(task.id)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            phase: "FAILED_PR_CREATE",
            message: "GitHub rejected [REDACTED]"
          })
        ])
      );
    } finally {
      if (previousMode === undefined) {
        delete process.env.GITHUB_PR_MODE;
      } else {
        process.env.GITHUB_PR_MODE = previousMode;
      }
    }
  });
});
