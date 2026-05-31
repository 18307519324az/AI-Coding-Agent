import { describe, expect, it } from "vitest";
import { redactSecrets } from "../src/redaction";

describe("redactSecrets", () => {
  it("redacts GitHub tokens from logs", () => {
    const output = redactSecrets("GITHUB_TOKEN=" + "github_pat_" + "1234567890abcdefghijklmnop");

    expect(output).toBe("[REDACTED]");
  });

  it("redacts OpenAI keys from logs", () => {
    const output = redactSecrets("OPENAI_API_KEY=" + "sk-" + "abcdefghijklmnopqrstuvwxyz123456");

    expect(output).toBe("[REDACTED]");
  });
});
