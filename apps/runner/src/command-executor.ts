import { evaluateCommand, redactSecrets } from "@ai-coding-agent/agent-core";
import { execa } from "execa";
import fs from "node:fs/promises";
import { assertPathInside } from "./workspace-policy";

export type CommandExecutionResult = {
  command: string;
  status: "PASSED" | "FAILED" | "SKIPPED";
  output: string;
  durationMs: number;
};

export type CommandRunner = (input: {
  command: string;
  cwd: string;
  approvedHighRisk?: boolean;
  workspaceRoot?: string;
}) => Promise<CommandExecutionResult>;

const commandEnvAllowlist = [
  "APPDATA",
  "CI",
  "ComSpec",
  "COREPACK_HOME",
  "HOME",
  "LOCALAPPDATA",
  "NODE_ENV",
  "PATH",
  "PATHEXT",
  "Path",
  "PLAYWRIGHT_BROWSERS_PATH",
  "ProgramFiles",
  "SystemDrive",
  "SystemRoot",
  "TEMP",
  "TMP",
  "USERPROFILE",
  "WINDIR",
  "windir"
];

function isSensitiveEnvName(name: string): boolean {
  return /(TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH|OPENAI|GITHUB|RUNNER_API_KEY)/i.test(name);
}

function createCommandEnv(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const name of commandEnvAllowlist) {
    const value = source[name];
    if (value && !isSensitiveEnvName(name)) {
      env[name] = value;
    }
  }
  return env;
}

function isSecretEnvFile(name: string): boolean {
  const lower = name.toLowerCase();
  return lower === ".env" || (lower.startsWith(".env.") && ![".env.example", ".env.sample", ".env.template"].includes(lower));
}

async function workspaceHasSecretEnvFile(cwd: string): Promise<boolean> {
  const entries = await fs.readdir(cwd, {
    withFileTypes: true
  });
  return entries.some((entry) => entry.isFile() && isSecretEnvFile(entry.name));
}

function assertCommandCwd(input: { cwd: string; workspaceRoot?: string }): void {
  if (input.workspaceRoot) {
    assertPathInside(input.workspaceRoot, input.cwd);
  }
}

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

export const executeAllowedCommand: CommandRunner = async (input) => {
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
    assertCommandCwd(input);
  } catch (error) {
    return {
      command: decision.command,
      status: "SKIPPED",
      output: error instanceof Error ? error.message : "Command working directory is outside the workspace.",
      durationMs: Date.now() - startedAt
    };
  }

  try {
    if (await workspaceHasSecretEnvFile(input.cwd)) {
      return {
        command: decision.command,
        status: "SKIPPED",
        output: "Command execution is blocked because the workspace root contains a secret .env file.",
        durationMs: Date.now() - startedAt
      };
    }
    const [file, args] = splitCommand(decision.command);
    const result = await execa(file, args, {
      cwd: input.cwd,
      all: true,
      env: createCommandEnv(),
      extendEnv: false,
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
};
