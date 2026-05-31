import type {
  AgentRunLog,
  AgentTask,
  Approval,
  DiffSummary,
  Repository,
  TestResult
} from "@ai-coding-agent/shared";

export type RunnerStore = {
  repositories: Map<string, Repository>;
  tasks: Map<string, AgentTask>;
  logs: Map<string, AgentRunLog[]>;
  approvals: Map<string, Approval[]>;
  tests: Map<string, TestResult[]>;
  diffs: Map<string, DiffSummary>;
};

export function createStore(): RunnerStore {
  return {
    repositories: new Map(),
    tasks: new Map(),
    logs: new Map(),
    approvals: new Map(),
    tests: new Map(),
    diffs: new Map()
  };
}

export function listTaskApprovals(store: RunnerStore, taskId: string): Approval[] {
  return store.approvals.get(taskId) ?? [];
}

export function upsertApproval(store: RunnerStore, approval: Approval): void {
  const approvals = store.approvals.get(approval.taskId) ?? [];
  const next = approvals.filter((item) => item.id !== approval.id);
  next.push(approval);
  store.approvals.set(approval.taskId, next);
}

export function appendLog(store: RunnerStore, log: AgentRunLog): void {
  const logs = store.logs.get(log.taskId) ?? [];
  logs.push(log);
  store.logs.set(log.taskId, logs);
}

export function appendTest(store: RunnerStore, result: TestResult): void {
  const tests = store.tests.get(result.taskId) ?? [];
  tests.push(result);
  store.tests.set(result.taskId, tests);
}

