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
      status: "COMPLETED"
    });
    expect(store.jobs.get(job.id)).toMatchObject({
      status: "COMPLETED"
    });
  });

  it("records failed jobs without throwing out of the queue processor", async () => {
    const store = createStore();
    const job = enqueueJob(store, {
      type: "PLAN_TASK",
      payload: {}
    });

    const failed = await processNextJob(store, async () => {
      throw new Error("processor failed");
    });

    expect(failed).toMatchObject({
      id: job.id,
      status: "FAILED",
      error: "processor failed"
    });
  });
});
