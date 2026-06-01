import type {
  AgentRunLog,
  AgentTask,
  Approval,
  DiffSummary,
  Repository,
  TestResult
} from "@ai-coding-agent/shared";
import {
  approvals as mockApprovals,
  diffSummary as mockDiff,
  getRepository as getMockRepository,
  getTask as getMockTask,
  logs as mockLogs,
  repositories as mockRepositories,
  tasks as mockTasks,
  testResults as mockTests
} from "./mock-data";
import { createRunnerHeaders, runnerBaseUrl } from "./runner-config";

export type TaskDetail = AgentTask & {
  approvals: Approval[];
  diff?: DiffSummary;
  logs: AgentRunLog[];
  repository?: Repository;
  tests: TestResult[];
};

function hydrateTask(task: AgentTask): AgentTask {
  return {
    ...task,
    createdAt: new Date(task.createdAt),
    updatedAt: new Date(task.updatedAt)
  };
}

function hydrateRepository(repository: Repository): Repository {
  return {
    ...repository,
    createdAt: new Date(repository.createdAt)
  };
}

function hydrateApproval(approval: Approval): Approval {
  return {
    ...approval,
    createdAt: new Date(approval.createdAt),
    resolvedAt: approval.resolvedAt ? new Date(approval.resolvedAt) : undefined
  };
}

function hydrateLog(log: AgentRunLog): AgentRunLog {
  return {
    ...log,
    createdAt: new Date(log.createdAt)
  };
}

function hydrateTest(test: TestResult): TestResult {
  return {
    ...test,
    createdAt: new Date(test.createdAt)
  };
}

async function safeJson<T>(path: string): Promise<T | undefined> {
  try {
    const response = await fetch(`${runnerBaseUrl}${path}`, {
      cache: "no-store",
      headers: createRunnerHeaders()
    });
    if (!response.ok) {
      return undefined;
    }
    return (await response.json()) as T;
  } catch {
    return undefined;
  }
}

export async function listRepositories(): Promise<Repository[]> {
  const live = await safeJson<{ repositories: Repository[] }>("/api/repositories");
  if (!live?.repositories?.length) {
    return mockRepositories;
  }

  return live.repositories.map(hydrateRepository);
}

export async function listTasks(): Promise<AgentTask[]> {
  const live = await safeJson<{ tasks: AgentTask[] }>("/api/tasks");
  if (!live?.tasks?.length) {
    return mockTasks;
  }

  return live.tasks.map(hydrateTask);
}

export async function getTaskDetail(taskId: string): Promise<TaskDetail | undefined> {
  const live = await safeJson<TaskDetail>(`/api/tasks/${taskId}`);
  if (live) {
    return {
      ...hydrateTask(live),
      approvals: (live.approvals ?? []).map(hydrateApproval),
      diff: live.diff,
      logs: (live.logs ?? []).map(hydrateLog),
      repository: live.repository ? hydrateRepository(live.repository) : undefined,
      tests: (live.tests ?? []).map(hydrateTest)
    };
  }

  const task = getMockTask(taskId);
  if (!task) {
    return undefined;
  }

  return {
    ...task,
    approvals: mockApprovals.filter((approval) => approval.taskId === taskId),
    diff: mockDiff.taskId === taskId ? mockDiff : undefined,
    logs: mockLogs.filter((log) => log.taskId === taskId),
    repository: getMockRepository(task.repositoryId),
    tests: mockTests.filter((test) => test.taskId === taskId)
  };
}

export function getRunnerBaseUrl(): string {
  return runnerBaseUrl;
}
