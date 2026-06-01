import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

export type WorkerLeaseRelease = () => Promise<void>;

export type WorkerLease = {
  acquire: () => Promise<WorkerLeaseRelease | undefined>;
};

export type FileWorkerLeaseOptions = {
  lockFile: string;
  staleMs?: number;
  heartbeatMs?: number;
};

function getNow(): Date {
  return new Date();
}

async function removeStaleLock(lockFile: string, staleMs: number | undefined): Promise<void> {
  if (!staleMs || staleMs <= 0) {
    return;
  }

  try {
    const stat = await fs.stat(lockFile);
    if (Date.now() - stat.mtimeMs > staleMs) {
      await fs.rm(lockFile, { force: true });
    }
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
}

function createLockPayload(leaseId: string): string {
  return `${JSON.stringify({
    leaseId,
    pid: process.pid,
    acquiredAt: getNow().toISOString()
  })}\n`;
}

async function lockBelongsToLease(lockFile: string, leaseId: string): Promise<boolean> {
  try {
    const payload = JSON.parse(await fs.readFile(lockFile, "utf8")) as { leaseId?: unknown };
    return payload.leaseId === leaseId;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export function createFileWorkerLease(options: FileWorkerLeaseOptions): WorkerLease {
  const heartbeatMs = options.heartbeatMs ?? 5000;

  return {
    acquire: async () => {
      await fs.mkdir(path.dirname(options.lockFile), { recursive: true });
      await removeStaleLock(options.lockFile, options.staleMs);

      let handle: fs.FileHandle;
      try {
        handle = await fs.open(options.lockFile, "wx");
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") {
          return undefined;
        }
        throw error;
      }

      const leaseId = randomUUID();
      await handle.writeFile(createLockPayload(leaseId), "utf8");
      const heartbeat = setInterval(() => {
        void handle.utimes(getNow(), getNow()).catch(() => undefined);
      }, heartbeatMs);
      heartbeat.unref?.();

      return async () => {
        clearInterval(heartbeat);
        await handle.close();
        if (await lockBelongsToLease(options.lockFile, leaseId)) {
          await fs.rm(options.lockFile, { force: true });
        }
      };
    }
  };
}
