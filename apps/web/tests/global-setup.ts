import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("../../..", import.meta.url));
const webDir = path.join(rootDir, "apps", "web");
const runnerDir = path.join(rootDir, "apps", "runner");
const nextBin = path.join(webDir, "node_modules", "next", "dist", "bin", "next");
const tsxBin = path.join(rootDir, "node_modules", "tsx", "dist", "cli.mjs");
const runnerStoreFile = path.join(webDir, "test-results", `runner-store-${Date.now()}.json`);

const serverEnv: NodeJS.ProcessEnv = {
  ...process.env,
  NEXT_TELEMETRY_DISABLED: "1",
  RUNNER_API_KEY: process.env.RUNNER_API_KEY ?? "test-runner-api-key",
  RUNNER_STORE_FILE: runnerStoreFile,
  WEB_AUTH_PASSWORD: process.env.WEB_AUTH_PASSWORD ?? "test-web-password",
  WEB_AUTH_SESSION_SECRET: process.env.WEB_AUTH_SESSION_SECRET ?? "test-web-secret",
  WEB_AUTH_USERNAME: process.env.WEB_AUTH_USERNAME ?? "operator"
};
delete serverEnv.DATABASE_URL;
delete serverEnv.RUNNER_SQLITE_FILE;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runNode(args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd,
      env: serverEnv,
      stdio: "inherit",
      windowsHide: true
    });

    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${args[0]} exited with code ${code ?? "unknown"}`));
    });
  });
}

function startNode(args: string[], cwd: string): ChildProcess {
  return spawn(process.execPath, args, {
    cwd,
    env: serverEnv,
    stdio: "inherit",
    windowsHide: true
  });
}

async function waitForHttp(url: string): Promise<void> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // The server is still booting.
    }
    await delay(500);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  fs.mkdirSync(path.dirname(runnerStoreFile), { recursive: true });
  await runNode([nextBin, "build"], webDir);

  const children = [
    startNode([tsxBin, "src/index.ts"], runnerDir),
    startNode([nextBin, "start", "-p", "3000"], webDir)
  ];

  try {
    await Promise.all([
      waitForHttp("http://127.0.0.1:8787/health"),
      waitForHttp("http://127.0.0.1:3000")
    ]);
  } catch (error) {
    children.forEach((child) => child.kill());
    throw error;
  }

  return async () => {
    children.forEach((child) => child.kill());
    await delay(500);
    fs.rmSync(runnerStoreFile, { force: true });
  };
}
