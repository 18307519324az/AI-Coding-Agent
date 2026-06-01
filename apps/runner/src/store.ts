import type {
  AgentRunLog,
  AgentTask,
  Approval,
  DiffSummary,
  Repository,
  RunnerJob,
  TestResult
} from "@ai-coding-agent/shared";
import {
  AgentRunLogSchema,
  AgentTaskSchema,
  ApprovalSchema,
  DiffSummarySchema,
  RepositorySchema,
  RunnerJobSchema,
  TestResultSchema
} from "@ai-coding-agent/shared";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

export type RunnerStore = {
  repositories: Map<string, Repository>;
  tasks: Map<string, AgentTask>;
  logs: Map<string, AgentRunLog[]>;
  approvals: Map<string, Approval[]>;
  tests: Map<string, TestResult[]>;
  diffs: Map<string, DiffSummary>;
  jobs: Map<string, RunnerJob>;
  close?: () => void;
  persist?: () => void;
};

type StoreSnapshot = {
  repositories: Repository[];
  tasks: AgentTask[];
  logs: AgentRunLog[];
  approvals: Approval[];
  tests: TestResult[];
  diffs: DiffSummary[];
  jobs: RunnerJob[];
};

function groupByTaskId<T extends { taskId: string }>(items: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  items.forEach((item) => {
    grouped.set(item.taskId, [...(grouped.get(item.taskId) ?? []), item]);
  });
  return grouped;
}

function createSnapshot(store: RunnerStore): StoreSnapshot {
  return {
    repositories: [...store.repositories.values()],
    tasks: [...store.tasks.values()],
    logs: [...store.logs.values()].flat(),
    approvals: [...store.approvals.values()].flat(),
    tests: [...store.tests.values()].flat(),
    diffs: [...store.diffs.values()],
    jobs: [...store.jobs.values()]
  };
}

function parseSnapshot(raw: string): StoreSnapshot {
  const value = JSON.parse(raw) as StoreSnapshot;
  return {
    repositories: RepositorySchema.array().parse(value.repositories ?? []),
    tasks: AgentTaskSchema.array().parse(value.tasks ?? []),
    logs: AgentRunLogSchema.array().parse(value.logs ?? []),
    approvals: ApprovalSchema.array().parse(value.approvals ?? []),
    tests: TestResultSchema.array().parse(value.tests ?? []),
    diffs: DiffSummarySchema.array().parse(value.diffs ?? []),
    jobs: RunnerJobSchema.array().parse(value.jobs ?? [])
  };
}

export function createStore(snapshot?: StoreSnapshot): RunnerStore {
  const store: RunnerStore = {
    repositories: new Map(),
    tasks: new Map(),
    logs: new Map(),
    approvals: new Map(),
    tests: new Map(),
    diffs: new Map(),
    jobs: new Map()
  };

  if (!snapshot) {
    return store;
  }

  snapshot.repositories.forEach((repository) => store.repositories.set(repository.id, repository));
  snapshot.tasks.forEach((task) => store.tasks.set(task.id, task));
  store.logs = groupByTaskId(snapshot.logs);
  store.approvals = groupByTaskId(snapshot.approvals);
  store.tests = groupByTaskId(snapshot.tests);
  snapshot.diffs.forEach((diff) => store.diffs.set(diff.taskId, diff));
  snapshot.jobs.forEach((job) => store.jobs.set(job.id, job));

  return store;
}

export function createFileBackedStore(filePath: string): RunnerStore {
  const snapshot = fs.existsSync(filePath)
    ? parseSnapshot(fs.readFileSync(filePath, "utf8"))
    : undefined;
  const store = createStore(snapshot);
  store.persist = () => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(createSnapshot(store), null, 2)}\n`);
  };
  return store;
}

export function createSqliteBackedStore(filePath: string): RunnerStore {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const database = new DatabaseSync(filePath);
  database.exec(`
    CREATE TABLE IF NOT EXISTS runner_snapshot (
      id TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  const row = database
    .prepare("SELECT value FROM runner_snapshot WHERE id = ?")
    .get("default") as { value: string } | undefined;
  const store = createStore(row ? parseSnapshot(row.value) : undefined);
  const upsert = database.prepare(`
    INSERT INTO runner_snapshot (id, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `);

  store.persist = () => {
    upsert.run("default", JSON.stringify(createSnapshot(store), null, 2), new Date().toISOString());
  };
  store.close = () => database.close();

  return store;
}

export function persistStore(store: RunnerStore): void {
  store.persist?.();
}

export function listTaskApprovals(store: RunnerStore, taskId: string): Approval[] {
  return store.approvals.get(taskId) ?? [];
}

export function upsertApproval(store: RunnerStore, approval: Approval): void {
  const approvals = store.approvals.get(approval.taskId) ?? [];
  const next = approvals.filter((item) => item.id !== approval.id);
  next.push(approval);
  store.approvals.set(approval.taskId, next);
  persistStore(store);
}

export function appendLog(store: RunnerStore, log: AgentRunLog): void {
  const logs = store.logs.get(log.taskId) ?? [];
  logs.push(log);
  store.logs.set(log.taskId, logs);
  persistStore(store);
}

export function appendTest(store: RunnerStore, result: TestResult): void {
  const tests = store.tests.get(result.taskId) ?? [];
  tests.push(result);
  store.tests.set(result.taskId, tests);
  persistStore(store);
}

export function upsertJob(store: RunnerStore, job: RunnerJob): void {
  store.jobs.set(job.id, job);
  persistStore(store);
}
