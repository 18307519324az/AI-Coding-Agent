import { describe, expect, it } from "vitest";
import { publishBranch } from "../src/git-publisher";

describe("publishBranch", () => {
  it("publishes a branch through the command allowlist runner", async () => {
    const commands: Array<{ command: string; approvedHighRisk?: boolean }> = [];

    await publishBranch({
      cwd: "D:/workspace/task_123/repo",
      branchName: "agent/fix-login",
      commitMessage: "Fix login button",
      commandRunner: async (input) => {
        commands.push({
          command: input.command,
          approvedHighRisk: input.approvedHighRisk
        });
        return {
          command: input.command,
          status: "PASSED",
          output: "",
          durationMs: 1
        };
      }
    });

    expect(commands).toEqual([
      { command: "git checkout -b agent/fix-login", approvedHighRisk: undefined },
      { command: "git add .", approvedHighRisk: undefined },
      { command: "git commit -m \"Fix login button\"", approvedHighRisk: undefined },
      { command: "git push origin agent/fix-login", approvedHighRisk: true }
    ]);
  });

  it("stops when a publish command fails", async () => {
    await expect(
      publishBranch({
        cwd: "D:/workspace/task_123/repo",
        branchName: "agent/fix-login",
        commitMessage: "Fix login button",
        commandRunner: async (input) => ({
          command: input.command,
          status: input.command === "git commit -m \"Fix login button\"" ? "FAILED" : "PASSED",
          output: "nothing to commit",
          durationMs: 1
        })
      })
    ).rejects.toThrow("git commit");
  });

  it("sanitizes multiline commit messages before execution", async () => {
    const commands: string[] = [];

    await publishBranch({
      cwd: "D:/workspace/task_123/repo",
      branchName: "agent/fix-login",
      commitMessage: "Fix login\n\"button\"",
      commandRunner: async (input) => {
        commands.push(input.command);
        return {
          command: input.command,
          status: "PASSED",
          output: "",
          durationMs: 1
        };
      }
    });

    expect(commands).toContain("git commit -m \"Fix login button\"");
  });
});
