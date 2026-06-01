import { createServer } from "./server";
import { createFileBackedStore } from "./store";
import path from "node:path";

const port = Number(process.env.RUNNER_PORT ?? 8787);
const host = process.env.RUNNER_HOST ?? "0.0.0.0";
const storeFile = process.env.RUNNER_STORE_FILE ?? path.resolve(process.cwd(), ".runner-data", "store.json");

const app = createServer(createFileBackedStore(storeFile));

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
