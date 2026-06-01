import type { RunnerJob } from "@ai-coding-agent/shared";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createJobWorker } from "../src/job-worker";
import { createFileWorkerLease } from "../src/worker-lease";

function createJob(id: string): RunnerJob {
  return {
    id,
    type: "PLAN_TASK",
    status: "COMPLETED",
    payload: {},
    attempts: 1,
    maxAttempts: 3,
    createdAt: new Date(),
    startedAt: new Date(),
    completedAt: new Date()
  };
}

async function waitForCondition(condition: () => boolean): Promise<void> {
  const startedAt = Date.now();
  while (!condition()) {
    if (Date.now() - startedAt > 1000) {
      throw new Error("Timed out waiting for test condition.");
    }
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

describe("job worker", () => {
  it("processes immediately and then on the configured interval until stopped", async () => {
    vi.useFakeTimers();
    try {
      const processNext = vi.fn(async () => undefined);
      const worker = createJobWorker({
        intervalMs: 50,
        processNext
      });

      worker.start();
      await Promise.resolve();
      expect(worker.isRunning()).toBe(true);
      expect(processNext).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(50);
      expect(processNext).toHaveBeenCalledTimes(2);

      worker.stop();
      expect(worker.isRunning()).toBe(false);
      await vi.advanceTimersByTimeAsync(150);
      expect(processNext).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("processes up to the configured concurrency", async () => {
    const releases: Array<(job: RunnerJob) => void> = [];
    const processNext = vi.fn(
      () => new Promise<RunnerJob>((resolve) => {
        releases.push(resolve);
      })
    );
    const worker = createJobWorker({
      concurrency: 2,
      processNext
    });

    const processing = worker.processOnce();
    expect(processNext).toHaveBeenCalledTimes(2);

    releases[0]?.(createJob("job_a"));
    releases[1]?.(createJob("job_b"));
    await expect(processing).resolves.toMatchObject({
      id: "job_a"
    });
  });

  it("does not start overlapping processors", async () => {
    let release: ((job: RunnerJob) => void) | undefined;
    const processNext = vi.fn(
      () => new Promise<RunnerJob>((resolve) => {
        release = resolve;
      })
    );
    const worker = createJobWorker({ processNext });

    const first = worker.processOnce();
    const second = worker.processOnce();

    await expect(second).resolves.toBeUndefined();
    expect(processNext).toHaveBeenCalledTimes(1);

    release?.(createJob("job_123"));
    await expect(first).resolves.toMatchObject({
      id: "job_123"
    });
  });

  it("reports unexpected processor errors without crashing the worker", async () => {
    const errors: unknown[] = [];
    const worker = createJobWorker({
      processNext: async () => {
        throw new Error("worker failed");
      },
      onError: (error) => errors.push(error)
    });

    await expect(worker.processOnce()).resolves.toBeUndefined();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(Error);
  });

  it("uses a lease to prevent another worker from processing concurrently", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ai-coding-agent-worker-lease-"));
    try {
      const lockFile = path.join(tempRoot, "job-worker.lock");
      let release: ((job: RunnerJob) => void) | undefined;
      const firstWorker = createJobWorker({
        lease: createFileWorkerLease({ lockFile }),
        processNext: () => new Promise<RunnerJob>((resolve) => {
          release = resolve;
        })
      });
      const secondProcessNext = vi.fn(async () => createJob("job_b"));
      const secondWorker = createJobWorker({
        lease: createFileWorkerLease({ lockFile }),
        processNext: secondProcessNext
      });

      const first = firstWorker.processOnce();
      await waitForCondition(() => Boolean(release));
      await expect(secondWorker.processOnce()).resolves.toBeUndefined();
      expect(secondProcessNext).not.toHaveBeenCalled();

      release?.(createJob("job_a"));
      await expect(first).resolves.toMatchObject({
        id: "job_a"
      });

      await expect(secondWorker.processOnce()).resolves.toMatchObject({
        id: "job_b"
      });
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("does not remove a lock file that belongs to another lease", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ai-coding-agent-worker-lease-"));
    try {
      const lockFile = path.join(tempRoot, "job-worker.lock");
      const release = await createFileWorkerLease({ heartbeatMs: 60_000, lockFile }).acquire();
      expect(release).toBeDefined();

      await fs.writeFile(lockFile, `${JSON.stringify({
        acquiredAt: new Date().toISOString(),
        leaseId: "another-lease",
        pid: process.pid
      })}\n`);

      await release?.();
      await expect(fs.readFile(lockFile, "utf8")).resolves.toContain("another-lease");
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });
});
