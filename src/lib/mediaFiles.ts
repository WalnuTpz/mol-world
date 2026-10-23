import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import path from "node:path";
import { mkdir, rename, open, unlink, access } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { withFileLock } from "./fileLock";
import { withDatabaseWrite } from "./databaseWrite";

type Retirement = { source: string; target: string };
type Operation = {
  id: string;
  state: string;
  created: string[];
  retired: Retirement[];
};

export function mediaPath(url: string) {
  if (
    !/^\/(?:memes\/(?:original|thumb)|uploads|trash)\/[^/]+$/.test(url) ||
    [".", ".."].includes(path.posix.basename(url)) ||
    url.includes("\\")
  ) {
    throw new Error(`Unsupported local media path: ${url}`);
  }
  return path.join(process.cwd(), "data", url);
}

async function syncPath(filename: string) {
  const file = await open(filename, "r");
  try {
    await file.sync();
  } finally {
    await file.close();
  }
}
async function removeCreated(url: string) {
  const filename = mediaPath(url);
  try {
    await unlink(filename);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await syncPath(path.dirname(filename));
}

async function finishOperation(operation: Operation) {
  if (operation.state === "PREPARED") {
    for (const url of operation.created) await removeCreated(url);
  } else if (operation.state === "COMMITTED") {
    for (const { source, target } of operation.retired) {
      const referenced = await prisma.meme.findFirst({
        where: { OR: [{ mediaUrl: source }, { thumbUrl: source }] },
        select: { id: true },
      });
      if (referenced) continue;
      const from = mediaPath(source);
      const to = mediaPath(target);
      await mkdir(path.dirname(to), { recursive: true });
      try {
        await rename(from, to);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      await syncPath(path.dirname(from));
      await syncPath(path.dirname(to));
    }
  } else {
    throw new Error(`Unknown media operation state: ${operation.state}`);
  }
  await withDatabaseWrite(() =>
    prisma.mediaOperation.delete({ where: { id: operation.id } }),
  );
}

async function recoverLocked() {
  const operations = await prisma.mediaOperation.findMany({
    orderBy: { createdAt: "asc" },
  });
  for (const operation of operations)
    await finishOperation(operation as unknown as Operation);
}

export function recoverMediaOperations() {
  return withFileLock(
    path.join(process.cwd(), "data", ".media.lock"),
    recoverLocked,
  );
}

// Kernel-backed locking works across Next route bundles and local processes.
export function withMediaWrite<T>(operation: () => Promise<T>): Promise<T> {
  return withFileLock(
    path.join(process.cwd(), "data", ".media.lock"),
    async () => {
      await recoverLocked();
      return operation();
    },
  );
}

// New files are immutable and durable before the database switches references.
// Old files remain in place until commit. The operation marker is committed in
// the same SQLite transaction, so recovery can distinguish rollback from cleanup.
export async function withMediaMutation<T>(
  created: string[],
  retired: string[],
  prepare: () => Promise<void>,
  commit: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const operation: Operation = {
    id: randomUUID(),
    state: "PREPARED",
    created: [...new Set(created)],
    retired: [...new Set(retired)].map((source) => ({
      source,
      target: `/trash/${randomUUID()}${path.extname(source)}`,
    })),
  };
  for (const url of operation.created) {
    const filename = mediaPath(url);
    await mkdir(path.dirname(filename), { recursive: true });
    try {
      await access(filename);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    throw new Error(`Refusing to overwrite media: ${url}`);
  }
  await withDatabaseWrite(() =>
    prisma.mediaOperation.create({ data: operation }),
  );
  let result!: T;
  try {
    await prepare();
    for (const url of operation.created) {
      const filename = mediaPath(url);
      await syncPath(filename);
      await syncPath(path.dirname(filename));
    }
    result = await withDatabaseWrite(() =>
      prisma.$transaction(
        async (tx) => {
          const value = await commit(tx);
          result = value;
          await tx.mediaOperation.update({
            where: { id: operation.id },
            data: { state: "COMMITTED" },
          });
          return value;
        },
        { timeout: 60_000 },
      ),
    );
  } catch (error) {
    // Consult the durable marker if the transaction's completion was uncertain.
    // Never delete new files after a database commit that switched references.
    const stored = await prisma.mediaOperation.findUniqueOrThrow({
      where: { id: operation.id },
    });
    if (stored.state !== "COMMITTED") {
      try {
        await finishOperation(operation);
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          "Media mutation and rollback failed; recovery remains pending",
        );
      }
      throw error;
    }
  }
  operation.state = "COMMITTED";
  try {
    await finishOperation(operation);
  } catch (error) {
    console.error(
      "Media committed; file cleanup remains pending for recovery",
      error,
    );
  }
  return result;
}

export function withTrashedMedia<T>(
  urls: string[],
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return withMediaMutation([], urls, async () => {}, operation);
}
