import type { RunnerJob } from "@ai-coding-agent/shared";
import { describe, expect, it, vi } from "vitest";
import { createJobWorker } from "../src/job-worker";

function createJob(id: string): RunnerJob {
  return {
    id,
    type: "PLAN_TASK",
    status: "COMPLETED",
    payload: {},
    createdAt: new Date(),
    startedAt: new Date(),
    completedAt: new Date()
  };
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
});
