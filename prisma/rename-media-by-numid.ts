import "./env";
import path from "node:path";
import { access, copyFile } from "node:fs/promises";
import { constants } from "node:fs";
import { prisma } from "../lib/db";
import {
  mediaPath,
  withMediaWrite,
  withMediaMutation,
} from "../lib/mediaFiles";

async function exists(filename: string) {
  try {
    await access(filename);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return false;
  }
}
async function targetFor(source: string, numId: number) {
  const directory = path.posix.dirname(source);
  const ext = path.posix.extname(source);
  let target = `${directory}/${numId}${ext}`;
  if (target === source) return source;
  for (let suffix = 2; await exists(mediaPath(target)); suffix++)
    target = `${directory}/${numId}-${suffix}${ext}`;
  return target;
}
async function main() {
  return withMediaWrite(async () => {
    const rows = await prisma.meme.findMany({
      select: { id: true, numId: true, mediaUrl: true, thumbUrl: true },
      orderBy: { numId: "asc" },
    });
    const processed = new Set<string>();
    let updated = 0;
    for (const row of rows) {
      if (!row.numId || !row.mediaUrl.startsWith("/memes/original/")) continue;
      const changes: { source: string; target: string }[] = [];
      for (const source of new Set([row.mediaUrl, row.thumbUrl])) {
        if (processed.has(source)) continue;
        processed.add(source);
        if (!(await exists(mediaPath(source))))
          throw new Error(`Missing referenced media: ${source}`);
        const target = await targetFor(source, row.numId);
        if (target !== source) changes.push({ source, target });
      }
      if (!changes.length) continue;
      await withMediaMutation(
        changes.map((x) => x.target),
        changes.map((x) => x.source),
        async () => {
          for (const change of changes)
            await copyFile(
              mediaPath(change.source),
              mediaPath(change.target),
              constants.COPYFILE_EXCL,
            );
        },
        async (tx) => {
          for (const change of changes) {
            await tx.meme.updateMany({
              where: { mediaUrl: change.source },
              data: { mediaUrl: change.target },
            });
            await tx.meme.updateMany({
              where: { thumbUrl: change.source },
              data: { thumbUrl: change.target },
            });
          }
        },
      );
      updated += changes.length;
    }
    console.log(`Renamed ${updated} files and every database reference.`);
  });
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
