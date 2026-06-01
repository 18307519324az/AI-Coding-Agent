import type { AgentTask, E2eArtifact, E2eScreenshot, TestResult } from "@ai-coding-agent/shared";
import fs from "node:fs/promises";
import path from "node:path";
import { createId } from "./ids";
import { assertPathInside, sanitizeTaskId } from "./workspace-policy";

const reportDirectoryName = "playwright-report";
const testResultsDirectoryName = "test-results";

export type E2eArtifactOptions = {
  artifactRoot?: string;
};

function getArtifactRoot(options: E2eArtifactOptions = {}): string {
  return path.resolve(options.artifactRoot ?? process.env.RUNNER_ARTIFACT_DIR ?? path.join(".runner-data", "artifacts"));
}

function getTaskE2eArtifactDir(taskId: string, options: E2eArtifactOptions = {}): string {
  return path.join(getArtifactRoot(options), sanitizeTaskId(taskId), "e2e");
}

function toPortablePath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(filePath: string): Promise<boolean> {
  try {
    return (await fs.stat(filePath)).isDirectory();
  } catch {
    return false;
  }
}

async function copyDirectoryIfPresent(input: {
  source: string;
  destination: string;
  sourceRoot: string;
  destinationRoot: string;
}): Promise<boolean> {
  assertPathInside(input.sourceRoot, input.source);
  assertPathInside(input.destinationRoot, input.destination);

  if (!(await isDirectory(input.source))) {
    return false;
  }

  await fs.rm(input.destination, { recursive: true, force: true });
  await fs.cp(input.source, input.destination, { recursive: true });
  return true;
}

async function collectPngFiles(directory: string, sourceRoot: string): Promise<string[]> {
  assertPathInside(sourceRoot, directory);

  if (!(await isDirectory(directory))) {
    return [];
  }

  const found: string[] = [];
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    assertPathInside(sourceRoot, fullPath);

    if (entry.isDirectory()) {
      found.push(...await collectPngFiles(fullPath, sourceRoot));
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith(".png")) {
      found.push(fullPath);
    }
  }

  return found.sort();
}

function createScreenshotName(filePath: string, index: number): string {
  const baseName = path.basename(filePath, path.extname(filePath)).replace(/[-_]+/g, " ").trim();
  return baseName ? `${baseName} screenshot` : `E2E screenshot ${index + 1}`;
}

async function copyScreenshots(input: {
  sourceRoot: string;
  destinationRoot: string;
}): Promise<E2eScreenshot[]> {
  const sourceResultsDir = path.join(input.sourceRoot, testResultsDirectoryName);
  const screenshotFiles = await collectPngFiles(sourceResultsDir, input.sourceRoot);
  if (screenshotFiles.length === 0) {
    return [];
  }

  const destinationDir = path.join(input.destinationRoot, "screenshots");
  assertPathInside(input.destinationRoot, destinationDir);
  await fs.rm(destinationDir, { recursive: true, force: true });
  await fs.mkdir(destinationDir, { recursive: true });

  const screenshots: E2eScreenshot[] = [];
  for (const [index, source] of screenshotFiles.entries()) {
    const destination = path.join(destinationDir, `${index + 1}-${path.basename(source)}`);
    assertPathInside(input.sourceRoot, source);
    assertPathInside(input.destinationRoot, destination);
    await fs.copyFile(source, destination);
    screenshots.push({
      name: createScreenshotName(source, index),
      path: toPortablePath(destination),
      description: "Captured by Playwright during E2E verification."
    });
  }

  return screenshots;
}

function createFallbackE2eArtifact(task: AgentTask, result: TestResult): E2eArtifact {
  const artifactRoot = `artifacts/${task.id}/e2e`;
  return {
    id: createId("e2e"),
    taskId: task.id,
    command: result.command,
    reportUrl: `${artifactRoot}/${reportDirectoryName}/index.html`,
    screenshots: [
      {
        name: "Task detail verification",
        path: `${artifactRoot}/task-detail.png`,
        description: "Representative browser state captured during E2E verification."
      }
    ],
    createdAt: new Date()
  };
}

export async function collectE2eArtifact(
  task: AgentTask,
  result: TestResult,
  options: E2eArtifactOptions = {}
): Promise<E2eArtifact> {
  const sourceRoot = task.projectContext?.rootPath;
  if (!sourceRoot || !(await pathExists(sourceRoot))) {
    return createFallbackE2eArtifact(task, result);
  }

  const destinationRoot = getTaskE2eArtifactDir(task.id, options);
  await fs.mkdir(destinationRoot, { recursive: true });

  const reportSource = path.join(sourceRoot, reportDirectoryName);
  const reportDestination = path.join(destinationRoot, reportDirectoryName);
  const reportCopied = await copyDirectoryIfPresent({
    source: reportSource,
    destination: reportDestination,
    sourceRoot,
    destinationRoot
  });
  const reportIndex = reportCopied
    ? path.join(reportDestination, "index.html")
    : path.join(destinationRoot, reportDirectoryName, "index.html");

  return {
    id: createId("e2e"),
    taskId: task.id,
    command: result.command,
    reportUrl: toPortablePath(reportIndex),
    screenshots: await copyScreenshots({
      sourceRoot,
      destinationRoot
    }),
    createdAt: new Date()
  };
}
