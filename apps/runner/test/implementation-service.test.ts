import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyImplementationOutput,
  collectImplementationFiles,
  createOpenAIImplementationGenerator
} from "../src/implementation-service";

async function createWorkspace(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ai-coding-agent-impl-"));
  await fs.mkdir(path.join(root, "src"), { recursive: true });
  await fs.writeFile(path.join(root, "src", "index.ts"), "export const value = false;\n");
  await fs.writeFile(path.join(root, ".env"), "SECRET=hidden\n");
  return root;
}

describe("implementation-service", () => {
  it("collects bounded editable files from plan and project context", async () => {
    const rootPath = await createWorkspace();
    const files = await collectImplementationFiles({
      rootPath,
      plan: {
        summary: "Patch source",
        assumptions: [],
        targetFiles: ["src/index.ts", ".env", "src/**/*.ts"],
        steps: [],
        risks: [],
        requiresApproval: true
      },
      projectContext: {
        rootPath,
        packageManager: "pnpm",
        projectKind: "node",
        hasFrontend: false,
        scripts: {},
        recommendedCommands: {},
        relevantFiles: ["src/index.ts"]
      }
    });

    expect(files).toEqual([
      {
        path: "src/index.ts",
        content: "export const value = false;\n"
      }
    ]);
  });

  it("applies file edits inside the workspace", async () => {
    const rootPath = await createWorkspace();
    const changedFiles = await applyImplementationOutput({
      rootPath,
      output: {
        summary: "Patch source",
        edits: [
          {
            path: "src/index.ts",
            content: "export const value = true;\n"
          },
          {
            path: "test/index.test.ts",
            content: "import { value } from '../src/index';\n"
          }
        ],
        risks: []
      }
    });

    await expect(fs.readFile(path.join(rootPath, "src", "index.ts"), "utf8")).resolves.toBe(
      "export const value = true;\n"
    );
    await expect(fs.readFile(path.join(rootPath, "test", "index.test.ts"), "utf8")).resolves.toContain("value");
    expect(changedFiles).toEqual(["src/index.ts", "test/index.test.ts"]);
  });

  it("rejects edits outside the workspace or into secret files", async () => {
    const rootPath = await createWorkspace();

    await expect(applyImplementationOutput({
      rootPath,
      output: {
        summary: "Unsafe patch",
        edits: [{ path: "../outside.ts", content: "" }],
        risks: []
      }
    })).rejects.toThrow("unsafe path");

    await expect(applyImplementationOutput({
      rootPath,
      output: {
        summary: "Unsafe patch",
        edits: [{ path: ".env", content: "" }],
        risks: []
      }
    })).rejects.toThrow("unsafe path");
  });

  it("calls the OpenAI Responses API with an implementation schema", async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const generateImplementation = createOpenAIImplementationGenerator({
      apiKey: "test-key",
      model: "gpt-test",
      endpoint: "https://api.openai.test/v1/responses",
      fetcher: async (url, init) => {
        requests.push({ url, init });
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => ({
            output: [
              {
                content: [
                  {
                    type: "output_text",
                    text: JSON.stringify({
                      summary: "Patched source",
                      edits: [{ path: "src/index.ts", content: "export const value = true;\n" }],
                      risks: []
                    })
                  }
                ]
              }
            ]
          })
        };
      }
    });

    await expect(generateImplementation({
      task: {
        id: "task_123",
        userId: "local-user",
        repositoryId: "repo_123",
        title: "Fix source",
        prompt: "Flip the value.",
        status: "IMPLEMENTING",
        createdAt: new Date(),
        updatedAt: new Date()
      },
      plan: {
        summary: "Patch source",
        assumptions: [],
        targetFiles: ["src/index.ts"],
        steps: [],
        risks: [],
        requiresApproval: true
      },
      projectContext: {
        rootPath: "D:/workspace/task_123/repo",
        packageManager: "pnpm",
        projectKind: "node",
        hasFrontend: false,
        scripts: {},
        recommendedCommands: {},
        relevantFiles: ["src/index.ts"]
      },
      files: [{ path: "src/index.ts", content: "export const value = false;\n" }]
    })).resolves.toMatchObject({
      summary: "Patched source",
      edits: [{ path: "src/index.ts" }]
    });

    const body = JSON.parse(String(requests[0]?.init.body));
    expect(body).toMatchObject({
      model: "gpt-test",
      text: {
        format: {
          type: "json_schema",
          name: "agent_implementation",
          strict: true
        }
      }
    });
  });
});
