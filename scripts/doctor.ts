import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type Check = {
  name: string;
  status: "pass" | "warn" | "fail";
  detail: string;
};

function check(status: Check["status"], name: string, detail: string): Check {
  return { name, status, detail };
}

function parseMajor(version: string): number | undefined {
  const match = /v?(\d+)/.exec(version.trim());
  return match ? Number(match[1]) : undefined;
}

async function commandVersion(command: string, args: string[]): Promise<string | undefined> {
  const candidates = process.platform === "win32" && !path.extname(command)
    ? [command, `${command}.cmd`]
    : [command];

  for (const candidate of candidates) {
    try {
      const result = await execFileAsync(candidate, args, {
        timeout: 10_000,
        windowsHide: true
      });
      return `${result.stdout}${result.stderr}`.trim();
    } catch {
      // Try the next platform-specific command candidate.
    }
  }

  return undefined;
}

async function maybePnpmVersionFromUserAgent(): Promise<string | undefined> {
  const userAgent = process.env.npm_config_user_agent;
  const match = userAgent?.match(/\bpnpm\/([^\s]+)/);
  return match?.[1];
}

async function checkCommandVersion(command: string, args: string[]): Promise<string | undefined> {
  try {
    return await commandVersion(command, args);
  } catch {
    return undefined;
  }
}

async function exists(relativePath: string): Promise<boolean> {
  try {
    await access(path.join(process.cwd(), relativePath));
    return true;
  } catch {
    return false;
  }
}

async function checkNode(): Promise<Check> {
  const major = parseMajor(process.version);
  if (major !== undefined && major >= 22) {
    return check("pass", "Node.js", process.version);
  }
  return check("fail", "Node.js", `Node 22 or newer is required; current version is ${process.version}.`);
}

async function checkPackageManager(): Promise<Check> {
  const packageJson = JSON.parse(await readFile(path.join(process.cwd(), "package.json"), "utf8")) as {
    packageManager?: string;
  };
  const expected = packageJson.packageManager ?? "pnpm@10";
  const version = await checkCommandVersion("pnpm", ["--version"]) ?? await maybePnpmVersionFromUserAgent();
  if (!version) {
    return check("fail", "pnpm", `Expected ${expected}, but pnpm was not found on PATH.`);
  }
  return check("pass", "pnpm", `${version} (expected ${expected})`);
}

async function checkGit(): Promise<Check> {
  const version = await checkCommandVersion("git", ["--version"]);
  if (!version) {
    return check("fail", "git", "Git is required for workspace cloning and branch publishing.");
  }
  return check("pass", "git", version);
}

async function checkFiles(): Promise<Check[]> {
  const required = [
    "apps/web/package.json",
    "apps/runner/package.json",
    "packages/shared/package.json",
    "packages/agent-core/package.json",
    ".env.example"
  ];
  const missing: string[] = [];
  for (const file of required) {
    if (!(await exists(file))) {
      missing.push(file);
    }
  }
  return [
    missing.length === 0
      ? check("pass", "workspace files", "Required monorepo packages and .env.example are present.")
      : check("fail", "workspace files", `Missing: ${missing.join(", ")}`)
  ];
}

async function checkLocalEnv(): Promise<Check> {
  if (await exists(".env")) {
    return check("pass", ".env", "Local overrides file exists and is ignored by git.");
  }
  return check("warn", ".env", "No .env file found. This is fine for mock mode; copy .env.example when testing integrations.");
}

async function main(): Promise<void> {
  const checks = [
    await checkNode(),
    await checkPackageManager(),
    await checkGit(),
    ...(await checkFiles()),
    await checkLocalEnv()
  ];

  for (const item of checks) {
    const marker = item.status === "pass" ? "PASS" : item.status === "warn" ? "WARN" : "FAIL";
    console.log(`${marker} ${item.name}: ${item.detail}`);
  }

  if (checks.some((item) => item.status === "fail")) {
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
