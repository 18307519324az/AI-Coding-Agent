import type { PackageManager, ProjectContext } from "@ai-coding-agent/shared";
import fs from "node:fs/promises";
import path from "node:path";

const relevantFileNames = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "bun.lockb",
  "tsconfig.json",
  "playwright.config.ts",
  "playwright.config.js",
  "vite.config.ts",
  "vite.config.js",
  "next.config.mjs",
  "next.config.js",
  "eslint.config.mjs",
  ".eslintrc.json"
]);

type PackageJson = {
  packageManager?: string;
  workspaces?: unknown;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readPackageJson(rootPath: string): Promise<PackageJson> {
  const raw = await fs.readFile(path.join(rootPath, "package.json"), "utf8");
  return JSON.parse(raw) as PackageJson;
}

async function collectRelevantFiles(rootPath: string): Promise<string[]> {
  const output: string[] = [];
  const queue = [rootPath];

  while (queue.length > 0 && output.length < 80) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".next" || entry.name === "dist") {
        continue;
      }

      const absolute = path.join(current, entry.name);
      const relative = path.relative(rootPath, absolute).replaceAll(path.sep, "/");
      if (entry.isDirectory()) {
        const depth = relative.split("/").length;
        if (depth <= 3) {
          queue.push(absolute);
        }
        continue;
      }

      if (relevantFileNames.has(entry.name) || relative.startsWith("apps/") || relative.startsWith("packages/")) {
        output.push(relative);
      }
    }
  }

  return output.sort();
}

async function detectPackageManager(rootPath: string, packageJson: PackageJson): Promise<PackageManager> {
  if (packageJson.packageManager?.startsWith("pnpm@")) {
    return "pnpm";
  }
  if (packageJson.packageManager?.startsWith("npm@")) {
    return "npm";
  }
  if (packageJson.packageManager?.startsWith("yarn@")) {
    return "yarn";
  }
  if (packageJson.packageManager?.startsWith("bun@")) {
    return "bun";
  }

  if (await pathExists(path.join(rootPath, "pnpm-lock.yaml"))) {
    return "pnpm";
  }
  if (await pathExists(path.join(rootPath, "package-lock.json"))) {
    return "npm";
  }
  if (await pathExists(path.join(rootPath, "yarn.lock"))) {
    return "yarn";
  }
  if (await pathExists(path.join(rootPath, "bun.lockb"))) {
    return "bun";
  }

  return "unknown";
}

function buildCommand(packageManager: PackageManager, script: string): string | undefined {
  if (packageManager === "unknown" || packageManager === "bun") {
    return undefined;
  }

  if (packageManager === "npm") {
    return script === "test" ? "npm test" : `npm run ${script}`;
  }

  return `${packageManager} ${script}`;
}

function detectProjectKind(packageJson: PackageJson): ProjectContext["projectKind"] {
  const dependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies
  };

  if (dependencies.next) {
    return "next";
  }
  if (dependencies.vite) {
    return "vite";
  }
  if (packageJson.workspaces) {
    return "monorepo";
  }
  if (dependencies.typescript || dependencies.tsx || dependencies.fastify) {
    return "node";
  }

  return "unknown";
}

export async function analyzeProject(rootPath: string): Promise<ProjectContext> {
  const packageJson = await readPackageJson(rootPath);
  const scripts = packageJson.scripts ?? {};
  const packageManager = await detectPackageManager(rootPath, packageJson);
  const projectKind = detectProjectKind(packageJson);

  const dependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies
  };
  const hasFrontend = Boolean(dependencies.next || dependencies.react || dependencies.vite);

  return {
    rootPath,
    packageManager,
    projectKind,
    hasFrontend,
    scripts,
    recommendedCommands: {
      install: packageManager === "unknown" ? undefined : `${packageManager} install`,
      lint: scripts.lint ? buildCommand(packageManager, "lint") : undefined,
      typecheck: scripts.typecheck ? buildCommand(packageManager, "typecheck") : undefined,
      test: scripts.test ? buildCommand(packageManager, "test") : undefined,
      e2e: scripts["test:e2e"] ? buildCommand(packageManager, "test:e2e") : undefined
    },
    relevantFiles: await collectRelevantFiles(rootPath)
  };
}

