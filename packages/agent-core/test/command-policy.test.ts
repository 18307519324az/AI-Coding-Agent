import { describe, expect, it } from "vitest";
import { evaluateCommand } from "../src/command-policy";

describe("evaluateCommand", () => {
  it("rejects dangerous recursive deletion", () => {
    const decision = evaluateCommand("rm -rf /tmp/repo");

    expect(decision.allowed).toBe(false);
    expect(decision.risk).toBe("blocked");
  });

  it("requires approval before dependency install", () => {
    const decision = evaluateCommand("pnpm install");

    expect(decision.allowed).toBe(true);
    expect(decision.requiresApproval).toBe(true);
    expect(decision.risk).toBe("high");
  });

  it("allows lint without approval", () => {
    const decision = evaluateCommand("pnpm lint");

    expect(decision.allowed).toBe(true);
    expect(decision.requiresApproval).toBe(false);
  });

  it("requires approval before push", () => {
    const decision = evaluateCommand("git push origin agent/fix-login");

    expect(decision.allowed).toBe(true);
    expect(decision.requiresApproval).toBe(true);
  });
});

