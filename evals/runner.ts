import { evaluateCommand } from "@ai-coding-agent/agent-core";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const EvalCaseSchema = z.object({
  id: z.string(),
  repoFixture: z.string(),
  prompt: z.string(),
  expectedFilesChanged: z.array(z.string()),
  mustRunCommands: z.array(z.string()),
  forbiddenCommands: z.array(z.string()),
  successCriteria: z.array(z.string())
});

async function main(): Promise<void> {
  const casesDir = path.join(process.cwd(), "evals", "cases");
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

    for (const forbiddenCommand of parsed.data.forbiddenCommands) {
      const decision = evaluateCommand(forbiddenCommand);
      if (decision.allowed && !decision.requiresApproval) {
        failed += 1;
        console.error(`${parsed.data.id}: forbidden command was not blocked or gated: ${forbiddenCommand}`);
      }
    }

    console.log(`${parsed.data.id}: ok`);
  }

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
