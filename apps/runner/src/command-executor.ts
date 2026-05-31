import { evaluateCommand, redactSecrets } from "@ai-coding-agent/agent-core";
import { execa } from "execa";

export type CommandExecutionResult = {
  command: string;
  status: "PASSED" | "FAILED" | "SKIPPED";
  output: string;
  durationMs: number;
};

function splitCommand(command: string): [string, string[]] {
  const [file, ...args] = command.split(" ");
  return [file, args];
}

export async function executeAllowedCommand(input: {
  command: string;
  cwd: string;
  approvedHighRisk?: boolean;
}): Promise<CommandExecutionResult> {
  const startedAt = Date.now();
  const decision = evaluateCommand(input.command);

  if (!decision.allowed) {
    return {
      command: decision.command,
      status: "SKIPPED",
      output: decision.reason,
      durationMs: Date.now() - startedAt
    };
  }

  if (decision.requiresApproval && !input.approvedHighRisk) {
    return {
      command: decision.command,
      status: "SKIPPED",
      output: "Command requires explicit approval.",
      durationMs: Date.now() - startedAt
    };
  }

  const [file, args] = splitCommand(decision.command);
  try {
    const result = await execa(file, args, {
      cwd: input.cwd,
      all: true,
      reject: false
    });

    return {
      command: decision.command,
      status: result.exitCode === 0 ? "PASSED" : "FAILED",
      output: redactSecrets(result.all ?? ""),
      durationMs: Date.now() - startedAt
    };
  } catch (error) {
    return {
      command: decision.command,
      status: "FAILED",
      output: redactSecrets(error instanceof Error ? error.message : String(error)),
      durationMs: Date.now() - startedAt
    };
  }
}

