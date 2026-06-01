import { createServer } from "./server";
import { createFileBackedStore, createSqliteBackedStore } from "./store";
import path from "node:path";

const port = Number(process.env.RUNNER_PORT ?? 8787);
const host = process.env.RUNNER_HOST ?? "0.0.0.0";
const storeFile = process.env.RUNNER_STORE_FILE ?? path.resolve(process.cwd(), ".runner-data", "store.json");
const sqliteStoreFile = process.env.RUNNER_SQLITE_FILE ??
  (process.env.DATABASE_URL?.startsWith("file:") ? process.env.DATABASE_URL.slice("file:".length) : undefined);

const app = createServer(sqliteStoreFile
  ? createSqliteBackedStore(path.resolve(process.cwd(), sqliteStoreFile))
  : createFileBackedStore(storeFile));

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
