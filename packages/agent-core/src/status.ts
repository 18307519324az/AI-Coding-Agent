import type { AgentTaskStatus } from "@ai-coding-agent/shared";

const transitions: Record<AgentTaskStatus, AgentTaskStatus[]> = {
  CREATED: ["REPO_CLONING", "CONTEXT_ANALYZING", "CANCELLED"],
  REPO_CLONING: ["CONTEXT_ANALYZING", "FAILED_CLONE", "CANCELLED"],
  CONTEXT_ANALYZING: ["PLAN_GENERATED", "FAILED_CONTEXT", "CANCELLED"],
  PLAN_GENERATED: ["WAITING_FOR_PLAN_APPROVAL", "CANCELLED"],
  WAITING_FOR_PLAN_APPROVAL: ["IMPLEMENTING", "CANCELLED"],
  IMPLEMENTING: ["TESTING", "FAILED_IMPLEMENTATION", "CANCELLED"],
  TESTING: ["E2E_VERIFYING", "SELF_REVIEWING", "FAILED_TEST", "CANCELLED"],
  E2E_VERIFYING: ["SELF_REVIEWING", "FAILED_E2E", "CANCELLED"],
  SELF_REVIEWING: ["WAITING_FOR_PR_APPROVAL", "CANCELLED"],
  WAITING_FOR_PR_APPROVAL: ["PR_CREATING", "CANCELLED"],
  PR_CREATING: ["COMPLETED", "FAILED_PR_CREATE", "CANCELLED"],
  COMPLETED: [],
  FAILED_CLONE: [],
  FAILED_CONTEXT: [],
  FAILED_IMPLEMENTATION: [],
  FAILED_TEST: [],
  FAILED_E2E: [],
  FAILED_PR_CREATE: [],
  FAILED: [],
  CANCELLED: []
};

export function getAllowedTransitions(status: AgentTaskStatus): AgentTaskStatus[] {
  return transitions[status];
}

export function canTransition(from: AgentTaskStatus, to: AgentTaskStatus): boolean {
  return transitions[from].includes(to);
}

export function assertTransition(from: AgentTaskStatus, to: AgentTaskStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid task transition: ${from} -> ${to}`);
  }
}

export function failureStatusFor(status: AgentTaskStatus): AgentTaskStatus {
  switch (status) {
    case "REPO_CLONING":
      return "FAILED_CLONE";
    case "CONTEXT_ANALYZING":
    case "PLAN_GENERATED":
    case "WAITING_FOR_PLAN_APPROVAL":
      return "FAILED_CONTEXT";
    case "IMPLEMENTING":
      return "FAILED_IMPLEMENTATION";
    case "TESTING":
      return "FAILED_TEST";
    case "E2E_VERIFYING":
      return "FAILED_E2E";
    case "PR_CREATING":
      return "FAILED_PR_CREATE";
    default:
      return "FAILED";
  }
}

