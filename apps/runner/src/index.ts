import { processNextRunnerJob } from "./job-processor";
import { createJobWorker } from "./job-worker";
import { createRunnerJobProcessorOptions, createServer, shouldUseQueuedJobs, type ServerOptions } from "./server";
import { createFileBackedStore, createSqliteBackedStore } from "./store";
import path from "node:path";

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const port = Number(process.env.RUNNER_PORT ?? 8787);
const host = process.env.RUNNER_HOST ?? "0.0.0.0";
const storeFile = process.env.RUNNER_STORE_FILE ?? path.resolve(process.cwd(), ".runner-data", "store.json");
const sqliteStoreFile = process.env.RUNNER_SQLITE_FILE ??
  (process.env.DATABASE_URL?.startsWith("file:") ? process.env.DATABASE_URL.slice("file:".length) : undefined);
const jobWorkerIntervalMs = parsePositiveInteger(process.env.RUNNER_JOB_WORKER_INTERVAL_MS, 1000);

const store = sqliteStoreFile
  ? createSqliteBackedStore(path.resolve(process.cwd(), sqliteStoreFile))
  : createFileBackedStore(storeFile);
const serverOptions: ServerOptions = {};
const app = createServer(store, serverOptions);
const jobWorker = shouldUseQueuedJobs(serverOptions)
  ? createJobWorker({
      intervalMs: jobWorkerIntervalMs,
      processNext: () => processNextRunnerJob(store, createRunnerJobProcessorOptions(serverOptions)),
      onError: (error) => app.log.error({ err: error }, "Runner job worker failed.")
    })
  : undefined;

app.addHook("onClose", async () => {
  jobWorker?.stop();
  store.close?.();
});

try {
  await app.listen({ port, host });
  if (jobWorker) {
    jobWorker.start();
    app.log.info({ intervalMs: jobWorkerIntervalMs }, "Runner job worker started.");
  }
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
