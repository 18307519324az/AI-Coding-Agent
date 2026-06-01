import { describe, expect, it } from "vitest";
import {
  createOpenAIPlanGenerator,
  deterministicPlanGenerator
} from "../src/model-service";

const plan = {
  summary: "Inspect the validation path and add a regression test.",
  assumptions: ["The failing path is reproducible locally."],
  targetFiles: ["src/api.ts", "test/api.test.ts"],
  steps: ["Inspect API validation.", "Patch the handler.", "Run pnpm test."],
  risks: ["Input validation may affect existing clients."],
  requiresApproval: true
};

describe("model-service", () => {
  it("keeps deterministic plan generation available by default", async () => {
    const generated = await deterministicPlanGenerator({
      title: "Fix API validation",
      prompt: "The API should return a validation error for bad input."
    });

    expect(generated.requiresApproval).toBe(true);
    expect(generated.steps).toEqual(expect.arrayContaining([expect.stringContaining("Clone the repository")]));
  });

  it("calls the OpenAI Responses API with a strict plan schema", async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const generatePlan = createOpenAIPlanGenerator({
      apiKey: "test-key",
      model: "gpt-test",
      endpoint: "https://api.openai.test/v1/responses",
      fetcher: async (url, init) => {
        requests.push({ url, init });
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => ({
            output: [
              {
                content: [
                  {
                    type: "output_text",
                    text: JSON.stringify(plan)
                  }
                ]
              }
            ]
          })
        };
      }
    });

    await expect(generatePlan({
      title: "Fix API validation",
      prompt: "The API should return a validation error for bad input."
    })).resolves.toEqual(plan);

    const body = JSON.parse(String(requests[0]?.init.body));
    expect(requests[0]).toMatchObject({
      url: "https://api.openai.test/v1/responses"
    });
    expect(body).toMatchObject({
      model: "gpt-test",
      text: {
        format: {
          type: "json_schema",
          name: "agent_plan",
          strict: true
        }
      }
    });
  });

  it("surfaces OpenAI API errors", async () => {
    const generatePlan = createOpenAIPlanGenerator({
      apiKey: "test-key",
      fetcher: async () => ({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        json: async () => ({})
      })
    });

    await expect(generatePlan({
      title: "Fix API validation",
      prompt: "The API should return a validation error for bad input."
    })).rejects.toThrow("OpenAI plan generation failed: 500");
  });
});
