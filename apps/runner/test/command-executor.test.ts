import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { executeAllowedCommand } from "../src/command-executor";

const tempRoots: string[] = [];

async function createWorkspace(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ai-coding-agent-command-"));
  tempRoots.push(root);
  await fs.writeFile(
    path.join(root, "package.json"),
    JSON.stringify({
      name: "command-executor-fixture",
      version: "0.0.0",
      private: true,
      scripts: {
        test: "node -e \"if (process.env.GITHUB_TOKEN) { console.log(process.env.GITHUB_TOKEN); process.exit(1); } console.log('no-token')\""
      }
    })
  );
  return root;
}

async function createFakePnpmBin(): Promise<string> {
  const bin = await fs.mkdtemp(path.join(os.tmpdir(), "ai-coding-agent-bin-"));
  tempRoots.push(bin);
  const nodeScript = "if (process.env.GITHUB_TOKEN) { console.log(process.env.GITHUB_TOKEN); process.exit(1); } console.log('no-token')";
  await fs.writeFile(path.join(bin, "pnpm.cmd"), `@echo off\r\nnode -e "${nodeScript}"\r\n`);
  await fs.writeFile(path.join(bin, "pnpm"), `#!/bin/sh\nnode -e "${nodeScript}"\n`);
  await fs.chmod(path.join(bin, "pnpm"), 0o755);
  return bin;
}

describe("command executor", () => {
  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
  });

  it("does not pass sensitive runner environment variables into repository scripts", async () => {
    const previousToken = process.env.GITHUB_TOKEN;
    const previousPath = process.env.PATH;
    process.env.GITHUB_TOKEN = "sensitive-runner-token";
    try {
      const root = await createWorkspace();
      const bin = await createFakePnpmBin();
      process.env.PATH = `${bin}${path.delimiter}${previousPath ?? ""}`;
      const result = await executeAllowedCommand({
        command: "pnpm test",
        cwd: root,
        workspaceRoot: root
      });

      expect(result).toMatchObject({
        status: "PASSED"
      });
      expect(result.output).toContain("no-token");
      expect(result.output).not.toContain("sensitive-runner-token");
    } finally {
      if (previousToken === undefined) {
        delete process.env.GITHUB_TOKEN;
      } else {
        process.env.GITHUB_TOKEN = previousToken;
      }
      if (previousPath === undefined) {
        delete process.env.PATH;
      } else {
        process.env.PATH = previousPath;
      }
    }
  });

  it("blocks command execution when the workspace root contains a secret env file", async () => {
    const root = await createWorkspace();
    await fs.writeFile(path.join(root, ".env"), "OPENAI_API_KEY=sk-test\n");

    const result = await executeAllowedCommand({
      command: "pnpm test",
      cwd: root,
      workspaceRoot: root
    });

    expect(result).toMatchObject({
      status: "SKIPPED",
      output: "Command execution is blocked because the workspace root contains a secret .env file."
    });
  });

  it("blocks command execution when cwd escapes the declared workspace root", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ai-coding-agent-root-"));
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "ai-coding-agent-outside-"));
    tempRoots.push(workspaceRoot, outside);

    const result = await executeAllowedCommand({
      command: "git status",
      cwd: outside,
      workspaceRoot
    });

    expect(result).toMatchObject({
      status: "SKIPPED"
    });
    expect(result.output).toContain("Workspace path escapes allowed root");
  });
});
