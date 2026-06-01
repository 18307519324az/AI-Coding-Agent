import { processNextRunnerJob } from "./job-processor";
import { createJobWorker } from "./job-worker";
import {
  createRunnerJobProcessorOptions,
  createServer,
  createWorkspaceCleanupOptions,
  shouldUseQueuedJobs,
  type ServerOptions
} from "./server";
import { createFileBackedStore, createSqliteBackedStore } from "./store";
import { createFileWorkerLease } from "./worker-lease";
import { cleanupTaskWorkspaces, createWorkspaceCleanupWorker } from "./workspace-cleanup";
import path from "node:path";

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePositiveHours(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const port = Number(process.env.RUNNER_PORT ?? 8787);
const host = process.env.RUNNER_HOST ?? "0.0.0.0";
const storeFile = process.env.RUNNER_STORE_FILE ?? path.resolve(process.cwd(), ".runner-data", "store.json");
const sqliteStoreFile = process.env.RUNNER_SQLITE_FILE ??
  (process.env.DATABASE_URL?.startsWith("file:") ? process.env.DATABASE_URL.slice("file:".length) : undefined);
const jobWorkerIntervalMs = parsePositiveInteger(process.env.RUNNER_JOB_WORKER_INTERVAL_MS, 1000);
const jobWorkerConcurrency = parsePositiveInteger(process.env.RUNNER_JOB_WORKER_CONCURRENCY, 1);
const jobWorkerLockFile = process.env.RUNNER_JOB_WORKER_LOCK_FILE ??
  path.resolve(process.cwd(), ".runner-data", "job-worker.lock");
const jobWorkerLockStaleMs = parsePositiveInteger(process.env.RUNNER_JOB_WORKER_LOCK_STALE_MS, 5 * 60 * 1000);
const jobMaxAttempts = parsePositiveInteger(process.env.RUNNER_JOB_MAX_ATTEMPTS, 3);
const jobRetryBackoffMs = parsePositiveInteger(process.env.RUNNER_JOB_RETRY_BACKOFF_MS, 1000);
const workspaceRetentionMs = parsePositiveHours(process.env.RUNNER_WORKSPACE_RETENTION_HOURS, 168) * 60 * 60 * 1000;
const workspaceCleanupIntervalMs = parsePositiveInteger(process.env.RUNNER_WORKSPACE_CLEANUP_INTERVAL_MS, 60 * 60 * 1000);
const useWorkspaceCleanup = process.env.RUNNER_WORKSPACE_CLEANUP !== "disabled";

const store = sqliteStoreFile
  ? createSqliteBackedStore(path.resolve(process.cwd(), sqliteStoreFile))
  : createFileBackedStore(storeFile);
const serverOptions: ServerOptions = {
  jobMaxAttempts,
  jobRetryBackoffMs,
  workspaceRetentionMs
};
const app = createServer(store, serverOptions);
const jobWorker = shouldUseQueuedJobs(serverOptions)
  ? createJobWorker({
      concurrency: jobWorkerConcurrency,
      intervalMs: jobWorkerIntervalMs,
      lease: createFileWorkerLease({
        lockFile: path.resolve(process.cwd(), jobWorkerLockFile),
        staleMs: jobWorkerLockStaleMs
      }),
      processNext: () => processNextRunnerJob(store, createRunnerJobProcessorOptions(serverOptions)),
      onError: (error) => app.log.error({ err: error }, "Runner job worker failed.")
    })
  : undefined;
const workspaceCleanupWorker = useWorkspaceCleanup
  ? createWorkspaceCleanupWorker({
      intervalMs: workspaceCleanupIntervalMs,
      cleanup: () => cleanupTaskWorkspaces(store, createWorkspaceCleanupOptions(serverOptions)),
      onError: (error) => app.log.error({ err: error }, "Workspace cleanup failed.")
    })
  : undefined;

app.addHook("onClose", async () => {
  jobWorker?.stop();
  workspaceCleanupWorker?.stop();
  store.close?.();
});

try {
  await app.listen({ port, host });
  if (jobWorker) {
    jobWorker.start();
    app.log.info(
      { concurrency: jobWorkerConcurrency, intervalMs: jobWorkerIntervalMs, lockFile: jobWorkerLockFile },
      "Runner job worker started."
    );
  }
  if (workspaceCleanupWorker) {
    workspaceCleanupWorker.start();
    app.log.info(
      { intervalMs: workspaceCleanupIntervalMs, retentionMs: workspaceRetentionMs },
      "Workspace cleanup worker started."
    );
  }
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
