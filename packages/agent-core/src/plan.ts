import type { PlanOutput, SelfReviewOutput, TestResult } from "@ai-coding-agent/shared";

export function createInitialPlan(input: {
  title: string;
  prompt: string;
  issueUrl?: string;
  projectKind?: string;
}): PlanOutput {
  return {
    summary: `Investigate "${input.title}", identify the smallest safe change, add regression coverage, and prepare a reviewed PR.`,
    assumptions: [
      "The repository can be cloned into an isolated workspace.",
      "Project scripts expose lint, typecheck, and test commands or equivalents.",
      input.issueUrl
        ? "The linked GitHub issue is the source of truth for expected behavior."
        : "The task prompt is the source of truth for expected behavior."
    ],
    targetFiles: [
      "package.json",
      "src/**/*",
      "tests/**/*",
      "playwright.config.*"
    ],
    steps: [
      "Clone the repository into a task-scoped workspace.",
      "Inspect package metadata and project structure.",
      "Search for files related to the issue or prompt.",
      "Apply a minimal patch after plan approval.",
      "Run lint, typecheck, unit tests, and Playwright checks when applicable.",
      "Generate diff, self-review, risk notes, and a PR body."
    ],
    risks: [
      "External services or missing secrets may require mocks during local verification.",
      "Front-end E2E checks may need browser installation in CI.",
      "GitHub write actions must remain blocked until approval."
    ],
    requiresApproval: true
  };
}

export function createSelfReview(input: {
  changedFiles: string[];
  tests: TestResult[];
  summary?: string;
}): SelfReviewOutput {
  return {
    summary: input.summary ?? "Completed the approved implementation path and prepared the change for PR review.",
    changedFiles: input.changedFiles,
    testsRun: input.tests.map((test) => ({
      command: test.command,
      status: test.status
    })),
    risks: [
      "Review the diff before approving push or PR creation.",
      "Confirm any skipped checks are acceptable for this repository."
    ],
    recommendation: input.tests.every((test) => test.status !== "FAILED")
      ? "Ready for PR review."
      : "Do not create a PR until failed checks are resolved."
  };
}

