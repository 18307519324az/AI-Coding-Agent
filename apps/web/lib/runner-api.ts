import type {
  AgentRunLog,
  AgentTask,
  AgentTraceEvent,
  Approval,
  DiffSummary,
  E2eArtifact,
  Repository,
  RunnerJob,
  RunnerMetrics,
  TestResult
} from "@ai-coding-agent/shared";
import {
  approvals as mockApprovals,
  diffSummary as mockDiff,
  getRepository as getMockRepository,
  getTask as getMockTask,
  e2eArtifacts as mockE2eArtifacts,
  logs as mockLogs,
  repositories as mockRepositories,
  runnerJobs as mockRunnerJobs,
  tasks as mockTasks,
  testResults as mockTests,
  traces as mockTraces
} from "./mock-data";
import { createRunnerHeaders, runnerBaseUrl } from "./runner-config";

export type TaskDetail = AgentTask & {
  approvals: Approval[];
  diff?: DiffSummary;
  e2eArtifacts: E2eArtifact[];
  jobs: RunnerJob[];
  logs: AgentRunLog[];
  repository?: Repository;
  tests: TestResult[];
  traces: AgentTraceEvent[];
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

function hydrateTrace(trace: AgentTraceEvent): AgentTraceEvent {
  return {
    ...trace,
    createdAt: new Date(trace.createdAt)
  };
}

function hydrateTest(test: TestResult): TestResult {
  return {
    ...test,
    createdAt: new Date(test.createdAt)
  };
}

function hydrateE2eArtifact(artifact: E2eArtifact): E2eArtifact {
  return {
    ...artifact,
    createdAt: new Date(artifact.createdAt)
  };
}

function hydrateRunnerJob(job: RunnerJob): RunnerJob {
  return {
    ...job,
    completedAt: job.completedAt ? new Date(job.completedAt) : undefined,
    createdAt: new Date(job.createdAt),
    nextRunAt: job.nextRunAt ? new Date(job.nextRunAt) : undefined,
    startedAt: job.startedAt ? new Date(job.startedAt) : undefined
  };
}

function hydrateRunnerMetrics(metrics: RunnerMetrics): RunnerMetrics {
  return {
    ...metrics,
    generatedAt: new Date(metrics.generatedAt)
  };
}

function countBy(items: string[]): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => ({
    ...counts,
    [item]: (counts[item] ?? 0) + 1
  }), {});
}

function createMockRunnerMetrics(): RunnerMetrics {
  return {
    service: "runner",
    uptimeSeconds: 0,
    generatedAt: new Date("2026-05-31T09:30:00Z"),
    repositories: mockRepositories.length,
    tasks: {
      total: mockTasks.length,
      byStatus: countBy(mockTasks.map((task) => task.status))
    },
    jobs: {
      total: mockRunnerJobs.length,
      byStatus: countBy(mockRunnerJobs.map((job) => job.status))
    },
    approvals: {
      pending: mockApprovals.filter((approval) => approval.status === "PENDING").length
    },
    traces: mockTraces.length,
    logs: mockLogs.length
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

export async function listRunnerJobs(): Promise<RunnerJob[]> {
  const live = await safeJson<{ jobs: RunnerJob[] }>("/api/jobs");
  if (!live?.jobs?.length) {
    return mockRunnerJobs;
  }

  return live.jobs.map(hydrateRunnerJob);
}

export async function getRunnerMetrics(): Promise<RunnerMetrics> {
  const live = await safeJson<RunnerMetrics>("/api/metrics");
  return live ? hydrateRunnerMetrics(live) : createMockRunnerMetrics();
}

export async function getTaskDetail(taskId: string): Promise<TaskDetail | undefined> {
  const live = await safeJson<TaskDetail>(`/api/tasks/${taskId}`);
  if (live) {
    return {
      ...hydrateTask(live),
      approvals: (live.approvals ?? []).map(hydrateApproval),
      diff: live.diff,
      e2eArtifacts: (live.e2eArtifacts ?? []).map(hydrateE2eArtifact),
      jobs: (live.jobs ?? []).map(hydrateRunnerJob),
      logs: (live.logs ?? []).map(hydrateLog),
      repository: live.repository ? hydrateRepository(live.repository) : undefined,
      tests: (live.tests ?? []).map(hydrateTest),
      traces: (live.traces ?? []).map(hydrateTrace)
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
    e2eArtifacts: mockE2eArtifacts.filter((artifact) => artifact.taskId === taskId),
    jobs: mockRunnerJobs.filter((job) => job.taskId === taskId),
    logs: mockLogs.filter((log) => log.taskId === taskId),
    repository: getMockRepository(task.repositoryId),
    tests: mockTests.filter((test) => test.taskId === taskId),
    traces: mockTraces.filter((trace) => trace.taskId === taskId)
  };
}

export function getRunnerBaseUrl(): string {
  return runnerBaseUrl;
}
