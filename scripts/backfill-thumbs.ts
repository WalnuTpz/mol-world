import "./env";
import sharp from "sharp";
import { access } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../src/lib/db";
import { generateThumb } from "../src/lib/thumbs";
import {
  mediaPath,
  withMediaWrite,
  withMediaMutation,
} from "../src/lib/mediaFiles";

async function exists(filename: string) {
  try {
    await access(filename);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return false;
  }
}

async function main() {
  return withMediaWrite(async () => {
    const rows = await prisma.meme.findMany({
      where: { mediaUrl: { startsWith: "/memes/original/" } },
      select: { mediaUrl: true },
    });
    let generated = 0;
    let updated = 0;
    for (const mediaUrl of new Set(rows.map((row) => row.mediaUrl))) {
      const file = path.posix.basename(mediaUrl);
      const inputPath = mediaPath(mediaUrl);
      const metadata = await sharp(inputPath, { animated: true }).metadata();
      const animated =
        path.extname(file).toLowerCase() === ".gif" ||
        (metadata.pages ?? 1) > 1;
      const thumbUrl = `/memes/thumb/${file}.${animated ? "gif" : "jpg"}`;
      const present = await exists(mediaPath(thumbUrl));
      const result = await withMediaMutation(
        present ? [] : [thumbUrl],
        [],
        async () => {
          if (!present)
            await generateThumb(inputPath, mediaPath(thumbUrl), animated);
        },
        (tx) =>
          tx.meme.updateMany({
            where: { mediaUrl },
            data: { thumbUrl, type: animated ? "ANIMATED" : "STATIC" },
          }),
      );
      if (!present) generated += 1;
      updated += result.count;
    }
    console.log(`Generated ${generated} thumbs, updated ${updated} records.`);
  });
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
