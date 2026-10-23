import "./env";
import { withFileLock } from "../lib/fileLock";
import { withDatabaseWrite } from "../lib/databaseWrite";
import path from "node:path";
import { mkdir, open } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { assertPrivateMediaStorage } from "../lib/storageLayout";
import { resolveDatabaseUrl } from "../lib/databaseUrl";

async function main() {
  await assertPrivateMediaStorage();
  const database = resolveDatabaseUrl().slice(5);
  await mkdir(path.dirname(database), { recursive: true });
  // Prisma's schema engine needs an existing SQLite file in this deployment.
  // Append mode creates an empty database without truncating existing data.
  await (await open(database, "a")).close();
  for (const directory of [
    "uploads",
    "memes/original",
    "memes/thumb",
    "trash",
  ]) {
    await mkdir(path.join("data", directory), { recursive: true });
  }
  await withFileLock(path.join(process.cwd(), "data", ".media.lock"), () =>
    withDatabaseWrite(async () => {
      const result = spawnSync(
        process.execPath,
        [
          path.resolve("node_modules/prisma/build/index.js"),
          "migrate",
          "deploy",
        ],
        { stdio: "inherit", env: process.env },
      );
      if (result.error) throw result.error;
      if (result.status !== 0)
        throw new Error(`Database migration failed (${result.status})`);
      const { prisma } = await import("../lib/db");
      const { rebuildNameOrder } = await import("../lib/nameOrder");
      try {
        await prisma.$transaction((tx) => rebuildNameOrder(tx), {
          timeout: 60_000,
        });
      } finally {
        await prisma.$disconnect();
      }
    }),
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
