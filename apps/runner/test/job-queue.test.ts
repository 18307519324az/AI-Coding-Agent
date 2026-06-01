import { describe, expect, it } from "vitest";
import { enqueueJob, processNextJob } from "../src/job-queue";
import { createStore } from "../src/store";

describe("job queue", () => {
  it("runs the next queued job and records completion", async () => {
    const store = createStore();
    const job = enqueueJob(store, {
      taskId: "task_123",
      type: "PLAN_TASK",
      payload: { taskId: "task_123" }
    });
    const seenJobs: string[] = [];

    const completed = await processNextJob(store, async (queuedJob) => {
      seenJobs.push(queuedJob.id);
    });

    expect(seenJobs).toEqual([job.id]);
    expect(completed).toMatchObject({
      id: job.id,
      attempts: 1,
      status: "COMPLETED"
    });
    expect(store.jobs.get(job.id)).toMatchObject({
      status: "COMPLETED"
    });
  });

  it("records terminal failed jobs without throwing out of the queue processor", async () => {
    const store = createStore();
    const job = enqueueJob(store, {
      type: "PLAN_TASK",
      payload: {},
      maxAttempts: 1
    });

    const failed = await processNextJob(store, async () => {
      throw new Error("processor failed");
    });

    expect(failed).toMatchObject({
      id: job.id,
      status: "FAILED",
      attempts: 1,
      error: "processor failed"
    });
  });

  it("requeues failed jobs until max attempts are exhausted", async () => {
    const store = createStore();
    const firstAttempt = new Date("2026-06-01T01:00:00Z");
    const secondAttempt = new Date("2026-06-01T01:00:01Z");
    const thirdAttempt = new Date("2026-06-01T01:00:03Z");
    const job = enqueueJob(store, {
      type: "PLAN_TASK",
      payload: {},
      maxAttempts: 3
    });
    store.jobs.set(job.id, {
      ...job,
      createdAt: firstAttempt
    });

    const retrying = await processNextJob(store, async () => {
      throw new Error("temporary failure");
    }, {
      now: () => firstAttempt,
      retryBackoffMs: 1000
    });
    expect(retrying).toMatchObject({
      id: job.id,
      status: "QUEUED",
      attempts: 1,
      error: "temporary failure",
      nextRunAt: new Date("2026-06-01T01:00:01Z")
    });

    await expect(processNextJob(store, async () => {
      throw new Error("not due");
    }, {
      now: () => new Date("2026-06-01T01:00:00.999Z"),
      retryBackoffMs: 1000
    })).resolves.toBeUndefined();

    const retryingAgain = await processNextJob(store, async () => {
      throw new Error("still temporary");
    }, {
      now: () => secondAttempt,
      retryBackoffMs: 1000
    });
    expect(retryingAgain).toMatchObject({
      id: job.id,
      status: "QUEUED",
      attempts: 2,
      error: "still temporary",
      nextRunAt: new Date("2026-06-01T01:00:03Z")
    });

    const failed = await processNextJob(store, async () => {
      throw new Error("terminal failure");
    }, {
      now: () => thirdAttempt,
      retryBackoffMs: 1000
    });
    expect(failed).toMatchObject({
      id: job.id,
      status: "FAILED",
      attempts: 3,
      error: "terminal failure"
    });
  });
});
