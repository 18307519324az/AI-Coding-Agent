import type { RunnerJob } from "@ai-coding-agent/shared";

export type JobWorkerOptions = {
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

export function createJobWorker(options: JobWorkerOptions): JobWorker {
  const intervalMs = options.intervalMs ?? 1000;
  let timer: ReturnType<typeof setInterval> | undefined;
  let processing = false;

  const processOnce = async (): Promise<RunnerJob | undefined> => {
    if (processing) {
      return undefined;
    }

    processing = true;
    try {
      return await options.processNext();
    } catch (error) {
      options.onError?.(error);
      return undefined;
    } finally {
      processing = false;
    }
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
