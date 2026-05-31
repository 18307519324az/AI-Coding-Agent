import type { SelfReviewOutput } from "@ai-coding-agent/shared";

export function generatePullRequestBody(review: SelfReviewOutput): string {
  const changedFiles = review.changedFiles.length
    ? review.changedFiles.map((file) => `- ${file}`).join("\n")
    : "- No file changes recorded";

  const tests = review.testsRun.length
    ? review.testsRun.map((test) => `- ${test.command}: ${test.status}`).join("\n")
    : "- No tests recorded";

  const risks = review.risks.length
    ? review.risks.map((risk) => `- ${risk}`).join("\n")
    : "- No known risks";

  return [
    "## Summary",
    review.summary,
    "",
    "## Changed Files",
    changedFiles,
    "",
    "## Tests",
    tests,
    "",
    "## Risk",
    risks,
    "",
    "## Notes for Reviewer",
    review.recommendation
  ].join("\n");
}

