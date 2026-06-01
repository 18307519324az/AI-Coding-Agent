import { createInitialPlan } from "@ai-coding-agent/agent-core";
import {
  PlanOutputSchema,
  type PlanOutput,
  type ProjectContext
} from "@ai-coding-agent/shared";

export type PlanGenerationInput = {
  title: string;
  prompt: string;
  issueUrl?: string;
  projectKind?: string;
  projectContext?: ProjectContext;
};

export type PlanGenerator = (input: PlanGenerationInput) => Promise<PlanOutput>;

type Fetcher = (input: string, init: RequestInit) => Promise<Pick<Response, "json" | "ok" | "status" | "statusText">>;

export type OpenAIPlanGeneratorOptions = {
  apiKey: string;
  model?: string;
  endpoint?: string;
  fetcher?: Fetcher;
};

const planJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "assumptions", "targetFiles", "steps", "risks", "requiresApproval"],
  properties: {
    summary: { type: "string" },
    assumptions: {
      type: "array",
      items: { type: "string" }
    },
    targetFiles: {
      type: "array",
      items: { type: "string" }
    },
    steps: {
      type: "array",
      items: { type: "string" }
    },
    risks: {
      type: "array",
      items: { type: "string" }
    },
    requiresApproval: {
      type: "boolean",
      enum: [true]
    }
  }
};

export const deterministicPlanGenerator: PlanGenerator = async (input) => createInitialPlan(input);

function createPlanPrompt(input: PlanGenerationInput): string {
  return JSON.stringify({
    title: input.title,
    prompt: input.prompt,
    issueUrl: input.issueUrl,
    projectKind: input.projectKind,
    projectContext: input.projectContext
      ? {
          packageManager: input.projectContext.packageManager,
          projectKind: input.projectContext.projectKind,
          hasFrontend: input.projectContext.hasFrontend,
          scripts: input.projectContext.scripts,
          recommendedCommands: input.projectContext.recommendedCommands,
          relevantFiles: input.projectContext.relevantFiles.slice(0, 40)
        }
      : undefined
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

export function createOpenAIPlanGenerator(options: OpenAIPlanGeneratorOptions): PlanGenerator {
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
                  "You are the planning component for AI Coding Agent.",
                  "Return only a JSON object that matches the provided schema.",
                  "Plans must preserve approval gates, minimal diffs, tests, self-review, and GitHub write safety."
                ].join(" ")
              }
            ]
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: createPlanPrompt(input)
              }
            ]
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "agent_plan",
            schema: planJsonSchema,
            strict: true
          }
        }
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI plan generation failed: ${response.status} ${response.statusText}`);
    }

    const raw = extractOutputText(await response.json());
    return PlanOutputSchema.parse(JSON.parse(raw));
  };
}

export function createPlanGeneratorFromEnv(): PlanGenerator {
  if (process.env.OPENAI_AGENT_MODE !== "live") {
    return deterministicPlanGenerator;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required when OPENAI_AGENT_MODE=live.");
  }

  return createOpenAIPlanGenerator({
    apiKey,
    model: process.env.OPENAI_MODEL
  });
}
