import { evaluateCommand, redactSecrets } from "@ai-coding-agent/agent-core";
import { execa } from "execa";

export type CommandExecutionResult = {
  command: string;
  status: "PASSED" | "FAILED" | "SKIPPED";
  output: string;
  durationMs: number;
};

function splitCommand(command: string): [string, string[]] {
  const parts: string[] = [];
  let current = "";
  let quote: "'" | "\"" | undefined;

  for (const char of command) {
    if (quote) {
      if (char === quote) {
        quote = undefined;
      } else {
        current += char;
      }
      continue;
    }

    if (char === "'" || char === "\"") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        parts.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (quote) {
    throw new Error("Command contains an unterminated quote.");
  }

  if (current) {
    parts.push(current);
  }

  const [file, ...args] = parts;
  if (!file) {
    throw new Error("Command is empty.");
  }

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

  try {
    const [file, args] = splitCommand(decision.command);
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
