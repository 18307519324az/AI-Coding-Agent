import type { RunnerJob } from "@ai-coding-agent/shared";

export type JobWorkerOptions = {
  concurrency?: number;
  intervalMs?: number;
  processNext: () => Promise<RunnerJob | undefined>;
  onError?: (error: unknown) => void;
};

export type JobWorker = {
  isRunning: () => boolean;
  processOnce: () => Promise<RunnerJob | undefined>;
  start: () => void;
  stop: () => void;
};

function normalizeConcurrency(value: number | undefined): number {
  return value !== undefined && Number.isInteger(value) && value > 0 ? value : 1;
}

export function createJobWorker(options: JobWorkerOptions): JobWorker {
  const concurrency = normalizeConcurrency(options.concurrency);
  const intervalMs = options.intervalMs ?? 1000;
  let timer: ReturnType<typeof setInterval> | undefined;
  let activeProcessors = 0;

  const processOnce = async (): Promise<RunnerJob | undefined> => {
    const availableSlots = concurrency - activeProcessors;
    if (availableSlots <= 0) {
      return undefined;
    }

    const jobs = await Promise.all(
      Array.from({ length: availableSlots }, async () => {
        activeProcessors += 1;
        try {
          return await options.processNext();
        } catch (error) {
          options.onError?.(error);
          return undefined;
        } finally {
          activeProcessors -= 1;
        }
      })
    );
    return jobs.find((job): job is RunnerJob => Boolean(job));
  };

  return {
    isRunning: () => Boolean(timer),
    processOnce,
    start: () => {
      if (timer) {
        return;
      }

      timer = setInterval(() => {
        void processOnce();
      }, intervalMs);
      timer.unref?.();
      void processOnce();
    },
    stop: () => {
      if (!timer) {
        return;
      }

      clearInterval(timer);
      timer = undefined;
    }
  };
}
