import type { AgentTaskStatus, TestStatus } from "@ai-coding-agent/shared";

const successStatuses: AgentTaskStatus[] = ["COMPLETED"];
const dangerStatuses: AgentTaskStatus[] = [
  "FAILED",
  "FAILED_CLONE",
  "FAILED_CONTEXT",
  "FAILED_IMPLEMENTATION",
  "FAILED_TEST",
  "FAILED_E2E",
  "FAILED_PR_CREATE",
  "CANCELLED"
];
const warningStatuses: AgentTaskStatus[] = [
  "WAITING_FOR_PLAN_APPROVAL",
  "WAITING_FOR_PR_APPROVAL",
  "TESTING",
  "E2E_VERIFYING",
  "PR_CREATING"
];

export function StatusBadge({ status }: { status: AgentTaskStatus | TestStatus }) {
  let tone = "neutral";

  if (status === "PASSED" || successStatuses.includes(status as AgentTaskStatus)) {
    tone = "success";
  } else if (status === "FAILED" || dangerStatuses.includes(status as AgentTaskStatus)) {
    tone = "danger";
  } else if (status === "SKIPPED" || warningStatuses.includes(status as AgentTaskStatus)) {
    tone = "warning";
  }

  return <span className={`badge ${tone}`}>{status.replaceAll("_", " ")}</span>;
}

