import type { AgentTaskStatus, RunnerJobStatus, TestStatus } from "@ai-coding-agent/shared";

type BadgeStatus = AgentTaskStatus | RunnerJobStatus | TestStatus;

const successStatuses: BadgeStatus[] = ["COMPLETED"];
const dangerStatuses: BadgeStatus[] = [
  "FAILED",
  "FAILED_CLONE",
  "FAILED_CONTEXT",
  "FAILED_IMPLEMENTATION",
  "FAILED_TEST",
  "FAILED_E2E",
  "FAILED_PR_CREATE",
  "CANCELLED"
];
const warningStatuses: BadgeStatus[] = [
  "QUEUED",
  "RUNNING",
  "WAITING_FOR_PLAN_APPROVAL",
  "WAITING_FOR_PR_APPROVAL",
  "TESTING",
  "E2E_VERIFYING",
  "PR_CREATING"
];

export function StatusBadge({ status }: { status: BadgeStatus }) {
  let tone = "neutral";

  if (status === "PASSED" || successStatuses.includes(status)) {
    tone = "success";
  } else if (status === "FAILED" || dangerStatuses.includes(status)) {
    tone = "danger";
  } else if (status === "SKIPPED" || warningStatuses.includes(status)) {
    tone = "warning";
  }

  return <span className={`badge ${tone}`}>{status.replaceAll("_", " ")}</span>;
}
