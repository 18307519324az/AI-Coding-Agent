import { evaluateCommand, generatePullRequestBody } from "@ai-coding-agent/agent-core";
import { SelfReviewOutputSchema } from "@ai-coding-agent/shared";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { approvePlanFlow, createTaskFlow, type CommandRunner } from "../apps/runner/src/mock-flow";
import { analyzeProject } from "../apps/runner/src/project-analyzer";
import { createStore, listTaskApprovals } from "../apps/runner/src/store";

const FlowImplementationSchema = z.object({
  summary: z.string(),
  edits: z.array(z.object({
    path: z.string().min(1),
    content: z.string()
  })).min(1),
  risks: z.array(z.string())
});

const EvalCaseSchema = z.object({
  id: z.string().min(1),
  repoFixture: z.string().min(1),
  prompt: z.string().min(10),
  expectedFilesChanged: z.array(z.string()),
  mustRunCommands: z.array(z.string()),
  forbiddenCommands: z.array(z.string()).min(1),
  successCriteria: z.array(z.string()).min(1),
  prSummaryEval: z.object({
    selfReview: SelfReviewOutputSchema,
    mustContain: z.array(z.string().min(1)).min(1),
    mustNotContain: z.array(z.string().min(1)).default([])
  }).optional(),
  flowEval: z.object({
    implementation: FlowImplementationSchema
  }).optional()
});

type EvalCase = z.infer<typeof EvalCaseSchema>;

function isInside(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function exists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function validateFixture(input: {
  caseFile: string;
  evalCase: EvalCase;
  evalsRoot: string;
}): Promise<string[]> {
  const errors: string[] = [];
  const expectedId = path.basename(input.caseFile, ".json");
  if (input.evalCase.id !== expectedId) {
    errors.push(`id must match file name ${expectedId}`);
  }

  const fixtureRoot = path.resolve(input.evalsRoot, input.evalCase.repoFixture);
  if (!isInside(input.evalsRoot, fixtureRoot)) {
    errors.push("repoFixture escapes evals directory");
    return errors;
  }
  if (!(await exists(fixtureRoot))) {
    errors.push(`repoFixture does not exist: ${input.evalCase.repoFixture}`);
    return errors;
  }
  if (!(await exists(path.join(fixtureRoot, "package.json")))) {
    errors.push(`repoFixture is missing package.json: ${input.evalCase.repoFixture}`);
  }

  for (const file of input.evalCase.expectedFilesChanged) {
    const target = path.resolve(fixtureRoot, file);
    if (!isInside(fixtureRoot, target)) {
      errors.push(`expectedFilesChanged escapes fixture: ${file}`);
      continue;
    }
    if (!(await exists(path.dirname(target)))) {
      errors.push(`expectedFilesChanged parent does not exist: ${file}`);
    }
  }

  return errors;
}

function validateCommands(evalCase: EvalCase): string[] {
  const errors: string[] = [];
  for (const command of evalCase.mustRunCommands) {
    const decision = evaluateCommand(command);
    if (!decision.allowed || decision.requiresApproval) {
      errors.push(`mustRunCommand is not safely runnable: ${command}`);
    }
  }

  for (const forbiddenCommand of evalCase.forbiddenCommands) {
    const decision = evaluateCommand(forbiddenCommand);
    if (decision.allowed && !decision.requiresApproval) {
      errors.push(`forbidden command was not blocked or gated: ${forbiddenCommand}`);
    }
  }

  return errors;
}

function validatePrSummary(evalCase: EvalCase): string[] {
  const errors: string[] = [];
  if (!evalCase.prSummaryEval) {
    return errors;
  }

  const body = generatePullRequestBody(evalCase.prSummaryEval.selfReview);
  for (const expected of evalCase.prSummaryEval.mustContain) {
    if (!body.includes(expected)) {
      errors.push(`PR summary is missing required text: ${expected}`);
    }
  }

  for (const forbidden of evalCase.prSummaryEval.mustNotContain) {
    if (body.includes(forbidden)) {
      errors.push(`PR summary contains forbidden text: ${forbidden}`);
    }
  }

  return errors;
}

async function readTree(rootPath: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  const queue = [rootPath];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === ".git" || entry.name === "node_modules" || entry.name === ".next" || entry.name === "dist") {
        continue;
      }

      const absolute = path.join(current, entry.name);
      const relative = path.relative(rootPath, absolute).replaceAll(path.sep, "/");
      if (entry.isDirectory()) {
        queue.push(absolute);
        continue;
      }

      files.set(relative, await readFile(absolute, "utf8"));
    }
  }

  return files;
}

async function createSyntheticDiff(input: {
  before: Map<string, string>;
  rootPath: string;
}): Promise<{ filesChanged: string[]; patch: string }> {
  const after = await readTree(input.rootPath);
  const files = [...new Set([...input.before.keys(), ...after.keys()])].sort();
  const filesChanged = files.filter((file) => input.before.get(file) !== after.get(file));
  const patch = filesChanged.map((file) => [
    `diff --git a/${file} b/${file}`,
    `--- a/${file}`,
    `+++ b/${file}`,
    "@@",
    after.has(file) ? "+ eval flow changed this file" : "- eval flow removed this file"
  ].join("\n")).join("\n");

  return {
    filesChanged,
    patch
  };
}

function createEvalCommandRunner(input: {
  before: Map<string, string>;
  commandsRun: string[];
}): CommandRunner {
  return async (commandInput) => {
    input.commandsRun.push(commandInput.command);
    const startedAt = Date.now();
    const decision = evaluateCommand(commandInput.command);

    if (!decision.allowed) {
      return {
        command: decision.command,
        status: "SKIPPED",
        output: decision.reason,
        durationMs: Date.now() - startedAt
      };
    }

    if (decision.requiresApproval && !commandInput.approvedHighRisk) {
      return {
        command: decision.command,
        status: "SKIPPED",
        output: "Command requires explicit approval.",
        durationMs: Date.now() - startedAt
      };
    }

    if (decision.command === "git diff") {
      const diff = await createSyntheticDiff({
        before: input.before,
        rootPath: commandInput.cwd
      });
      return {
        command: decision.command,
        status: "PASSED",
        output: diff.patch,
        durationMs: Date.now() - startedAt
      };
    }

    return {
      command: decision.command,
      status: "PASSED",
      output: `eval simulated ${decision.command}`,
      durationMs: Date.now() - startedAt
    };
  };
}

async function validateFlowEval(input: {
  evalCase: EvalCase;
  fixtureRoot: string;
}): Promise<string[]> {
  if (!input.evalCase.flowEval) {
    return [];
  }

  const errors: string[] = [];
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), `ai-coding-agent-eval-${input.evalCase.id}-`));
  const commandsRun: string[] = [];

  try {
    let before = new Map<string, string>();
    const store = createStore();
    const task = await createTaskFlow(store, {
      repositoryUrl: `https://github.com/eval-fixtures/${input.evalCase.id}`,
      title: input.evalCase.id,
      prompt: input.evalCase.prompt,
      branchPrefix: "eval",
      allowDependencyInstall: false,
      allowCreatePr: false
    }, {
      workspaceExecution: true,
      repositoryCloner: async (cloneInput) => {
        const target = path.join(tempRoot, cloneInput.taskId, "repo");
        await mkdir(path.dirname(target), { recursive: true });
        await cp(input.fixtureRoot, target, { recursive: true });
        before = await readTree(target);
        return target;
      },
      projectAnalyzer: analyzeProject,
      planGenerator: async () => ({
        summary: `Evaluate ${input.evalCase.id}.`,
        assumptions: ["The fixture repository represents the target failure mode."],
        targetFiles: input.evalCase.expectedFilesChanged,
        steps: input.evalCase.successCriteria,
        risks: [],
        requiresApproval: true
      })
    });

    if (task.status !== "WAITING_FOR_PLAN_APPROVAL") {
      return [`flowEval expected WAITING_FOR_PLAN_APPROVAL, got ${task.status}`];
    }

    const commandRunner = createEvalCommandRunner({
      before,
      commandsRun
    });
    const ready = await approvePlanFlow(store, task, {
      commandRunner,
      implementationGenerator: async () => input.evalCase.flowEval?.implementation ?? {
        summary: "No implementation.",
        edits: [],
        risks: ["Missing flowEval implementation."]
      }
    });

    if (ready.status !== "WAITING_FOR_PR_APPROVAL") {
      errors.push(`flowEval expected WAITING_FOR_PR_APPROVAL, got ${ready.status}`);
    }

    const diffFiles = store.diffs.get(task.id)?.filesChanged ?? [];
    for (const expected of input.evalCase.expectedFilesChanged) {
      if (!diffFiles.includes(expected)) {
        errors.push(`flowEval diff is missing expected file: ${expected}`);
      }
    }
    const unexpectedFiles = diffFiles.filter((file) => !input.evalCase.expectedFilesChanged.includes(file));
    if (unexpectedFiles.length > 0) {
      errors.push(`flowEval changed unexpected files: ${unexpectedFiles.join(", ")}`);
    }

    for (const command of input.evalCase.mustRunCommands) {
      if (!commandsRun.includes(command)) {
        errors.push(`flowEval did not run required command: ${command}`);
      }
    }
    for (const command of input.evalCase.forbiddenCommands) {
      if (commandsRun.includes(command)) {
        errors.push(`flowEval ran forbidden command: ${command}`);
      }
    }

    const failedTest = (store.tests.get(task.id) ?? []).find((test) => test.status !== "PASSED");
    if (failedTest) {
      errors.push(`flowEval verification failed: ${failedTest.command} ${failedTest.status}`);
    }

    const prApproval = listTaskApprovals(store, task.id).find(
      (approval) => approval.type === "CREATE_PR" && approval.status === "PENDING"
    );
    if (!prApproval) {
      errors.push("flowEval did not create a pending CREATE_PR approval");
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }

  return errors;
}

async function main(): Promise<void> {
  const evalsRoot = path.join(process.cwd(), "evals");
  const casesDir = path.join(evalsRoot, "cases");
  const files = (await readdir(casesDir)).filter((file) => file.endsWith(".json"));

  let failed = 0;

  for (const file of files) {
    const raw = await readFile(path.join(casesDir, file), "utf8");
    const parsed = EvalCaseSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      failed += 1;
      console.error(`${file}: invalid schema`, parsed.error.flatten());
      continue;
    }

    const fixtureErrors = await validateFixture({ caseFile: file, evalCase: parsed.data, evalsRoot });
    const fixtureRoot = path.resolve(evalsRoot, parsed.data.repoFixture);
    const errors = [
      ...fixtureErrors,
      ...validateCommands(parsed.data),
      ...validatePrSummary(parsed.data),
      ...(fixtureErrors.length === 0 ? await validateFlowEval({ evalCase: parsed.data, fixtureRoot }) : [])
    ];
    if (errors.length > 0) {
      failed += 1;
      console.error(`${parsed.data.id}: failed`);
      errors.forEach((error) => console.error(`  - ${error}`));
      continue;
    }

    console.log(
      `${parsed.data.id}: ok (${parsed.data.mustRunCommands.length} required commands, ` +
      `${parsed.data.forbiddenCommands.length} forbidden commands` +
      `${parsed.data.prSummaryEval ? ", pr summary" : ""}` +
      `${parsed.data.flowEval ? ", flow" : ""})`
    );
  }

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
