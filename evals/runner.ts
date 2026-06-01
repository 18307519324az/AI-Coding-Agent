import { evaluateCommand, generatePullRequestBody } from "@ai-coding-agent/agent-core";
import { SelfReviewOutputSchema } from "@ai-coding-agent/shared";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

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

    const errors = [
      ...(await validateFixture({ caseFile: file, evalCase: parsed.data, evalsRoot })),
      ...validateCommands(parsed.data),
      ...validatePrSummary(parsed.data)
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
      `${parsed.data.prSummaryEval ? ", pr summary" : ""})`
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
