import { redactSecrets } from "@ai-coding-agent/agent-core";
import type { CommandRunner } from "./command-executor";

export type BranchPublishInput = {
  cwd: string;
  branchName: string;
  commitMessage: string;
  commandRunner: CommandRunner;
};

export type BranchPublisher = (input: BranchPublishInput) => Promise<void>;

function sanitizeCommitMessage(message: string): string {
  const singleLine = message.replace(/[\r\n"]/g, " ").replace(/\s+/g, " ").trim();
  return (singleLine || "Apply agent changes").slice(0, 160);
}

async function runPublishStep(input: {
  command: string;
  cwd: string;
  commandRunner: CommandRunner;
  approvedHighRisk?: boolean;
}): Promise<void> {
  const result = await input.commandRunner({
    command: input.command,
    cwd: input.cwd,
    approvedHighRisk: input.approvedHighRisk
  });

  if (result.status === "PASSED") {
    return;
  }

  const output = result.output ? `: ${result.output}` : "";
  throw new Error(redactSecrets(`${result.command} ${result.status.toLowerCase()}${output}`));
}

export const publishBranch: BranchPublisher = async (input) => {
  const commitMessage = sanitizeCommitMessage(input.commitMessage);
  const steps = [
    { command: `git checkout -b ${input.branchName}` },
    { command: "git add ." },
    { command: `git commit -m "${commitMessage}"` },
    { command: `git push origin ${input.branchName}`, approvedHighRisk: true }
  ];

  for (const step of steps) {
    await runPublishStep({
      ...step,
      cwd: input.cwd,
      commandRunner: input.commandRunner
    });
  }
};
