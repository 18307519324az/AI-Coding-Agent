import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("../../..", import.meta.url));
const webDir = path.join(rootDir, "apps", "web");
const runnerDir = path.join(rootDir, "apps", "runner");
const nextBin = path.join(webDir, "node_modules", "next", "dist", "bin", "next");
const tsxBin = path.join(rootDir, "node_modules", "tsx", "dist", "cli.mjs");

const serverEnv = {
  ...process.env,
  NEXT_TELEMETRY_DISABLED: "1"
};

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
  };
}
