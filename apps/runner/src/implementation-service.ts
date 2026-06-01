import type { AgentTask, PlanOutput, ProjectContext } from "@ai-coding-agent/shared";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { assertPathInside } from "./workspace-policy";

const FileEditSchema = z.object({
  path: z.string().min(1),
  content: z.string()
});

export const ImplementationOutputSchema = z.object({
  summary: z.string(),
  edits: z.array(FileEditSchema).max(20),
  risks: z.array(z.string())
});

export type FileEdit = z.infer<typeof FileEditSchema>;
export type ImplementationOutput = z.infer<typeof ImplementationOutputSchema>;

export type ImplementationInput = {
  task: AgentTask;
  plan: PlanOutput;
  projectContext: ProjectContext;
  files: Array<{
    path: string;
    content: string;
  }>;
};

export type ImplementationGenerator = (input: ImplementationInput) => Promise<ImplementationOutput>;

type Fetcher = (input: string, init: RequestInit) => Promise<Pick<Response, "json" | "ok" | "status" | "statusText">>;

export type OpenAIImplementationGeneratorOptions = {
  apiKey: string;
  model?: string;
  endpoint?: string;
  fetcher?: Fetcher;
};

const implementationJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "edits", "risks"],
  properties: {
    summary: { type: "string" },
    edits: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["path", "content"],
        properties: {
          path: { type: "string" },
          content: { type: "string" }
        }
      }
    },
    risks: {
      type: "array",
      items: { type: "string" }
    }
  }
};

function isGlobPath(filePath: string): boolean {
  return /[*?[\]{}]/.test(filePath);
}

function isForbiddenRelativePath(filePath: string): boolean {
  const normalized = filePath.replaceAll("\\", "/");
  return (
    path.isAbsolute(filePath) ||
    normalized.split("/").includes("..") ||
    normalized.startsWith(".git/") ||
    normalized === ".git" ||
    normalized === ".env" ||
    normalized.startsWith(".env.")
  );
}

function resolveEditPath(rootPath: string, relativePath: string): string {
  if (isForbiddenRelativePath(relativePath)) {
    throw new Error(`Refusing to edit unsafe path: ${relativePath}`);
  }

  const target = path.resolve(rootPath, relativePath);
  assertPathInside(rootPath, target);
  return target;
}

async function readBoundedFile(rootPath: string, relativePath: string): Promise<string | undefined> {
  if (isGlobPath(relativePath) || isForbiddenRelativePath(relativePath)) {
    return undefined;
  }

  const target = path.resolve(rootPath, relativePath);
  assertPathInside(rootPath, target);

  try {
    const stat = await fs.stat(target);
    if (!stat.isFile() || stat.size > 40_000) {
      return undefined;
    }
    return await fs.readFile(target, "utf8");
  } catch {
    return undefined;
  }
}

export async function collectImplementationFiles(input: {
  rootPath: string;
  plan: PlanOutput;
  projectContext: ProjectContext;
}): Promise<ImplementationInput["files"]> {
  const candidates = [...new Set([
    ...input.plan.targetFiles,
    ...input.projectContext.relevantFiles
  ])].slice(0, 24);
  const files: ImplementationInput["files"] = [];

  for (const candidate of candidates) {
    const content = await readBoundedFile(input.rootPath, candidate);
    if (content !== undefined) {
      files.push({
        path: candidate,
        content
      });
    }
    if (files.length >= 12) {
      break;
    }
  }

  return files;
}

export async function applyImplementationOutput(input: {
  rootPath: string;
  output: ImplementationOutput;
}): Promise<string[]> {
  const parsed = ImplementationOutputSchema.parse(input.output);
  const changedFiles: string[] = [];

  for (const edit of parsed.edits) {
    const target = resolveEditPath(input.rootPath, edit.path);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, edit.content, "utf8");
    changedFiles.push(edit.path.replaceAll("\\", "/"));
  }

  return changedFiles;
}

function createImplementationPrompt(input: ImplementationInput): string {
  return JSON.stringify({
    task: {
      title: input.task.title,
      prompt: input.task.prompt,
      issueUrl: input.task.issueUrl
    },
    plan: input.plan,
    projectContext: {
      packageManager: input.projectContext.packageManager,
      projectKind: input.projectContext.projectKind,
      scripts: input.projectContext.scripts,
      recommendedCommands: input.projectContext.recommendedCommands
    },
    files: input.files
  }, null, 2);
}

function extractOutputText(response: unknown): string {
  if (typeof response !== "object" || response === null) {
    throw new Error("OpenAI response was not an object.");
  }

  const outputText = (response as { output_text?: unknown }).output_text;
  if (typeof outputText === "string" && outputText.trim()) {
    return outputText;
  }

  const output = (response as { output?: unknown }).output;
  if (!Array.isArray(output)) {
    throw new Error("OpenAI response did not include output text.");
  }

  for (const item of output) {
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) {
      continue;
    }

    for (const contentItem of content) {
      const text = (contentItem as { text?: unknown }).text;
      if (typeof text === "string" && text.trim()) {
        return text;
      }
    }
  }

  throw new Error("OpenAI response output text was empty.");
}

export function createOpenAIImplementationGenerator(
  options: OpenAIImplementationGeneratorOptions
): ImplementationGenerator {
  const endpoint = options.endpoint ?? "https://api.openai.com/v1/responses";
  const model = options.model ?? "gpt-5.2";
  const fetcher = options.fetcher ?? fetch;

  return async (input) => {
    const response = await fetcher(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${options.apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "developer",
            content: [
              {
                type: "input_text",
                text: [
                  "You are the implementation component for AI Coding Agent.",
                  "Return JSON only. Each edit must be a full replacement file content.",
                  "Keep changes minimal, testable, and aligned with the approved plan.",
                  "Do not edit secrets, .env files, or files outside the repository workspace."
                ].join(" ")
              }
            ]
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: createImplementationPrompt(input)
              }
            ]
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "agent_implementation",
            schema: implementationJsonSchema,
            strict: true
          }
        }
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI implementation failed: ${response.status} ${response.statusText}`);
    }

    const raw = extractOutputText(await response.json());
    return ImplementationOutputSchema.parse(JSON.parse(raw));
  };
}

export function createImplementationGeneratorFromEnv(): ImplementationGenerator | undefined {
  if (process.env.OPENAI_AGENT_MODE !== "live") {
    return undefined;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required when OPENAI_AGENT_MODE=live.");
  }

  return createOpenAIImplementationGenerator({
    apiKey,
    model: process.env.OPENAI_MODEL
  });
}
