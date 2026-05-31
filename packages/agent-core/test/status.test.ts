import { describe, expect, it } from "vitest";
import { assertTransition, canTransition, failureStatusFor } from "../src/status";

describe("agent task state machine", () => {
  it("moves from plan generated to waiting for approval", () => {
    expect(canTransition("PLAN_GENERATED", "WAITING_FOR_PLAN_APPROVAL")).toBe(true);
  });

  it("rejects skipping approval before implementation", () => {
    expect(() => assertTransition("PLAN_GENERATED", "IMPLEMENTING")).toThrow(
      "Invalid task transition"
    );
  });

  it("maps testing failures to FAILED_TEST", () => {
    expect(failureStatusFor("TESTING")).toBe("FAILED_TEST");
  });
});

