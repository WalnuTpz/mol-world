import "./env";
import { withMediaWrite, withMediaMutation } from "../src/lib/mediaFiles";
import { rebuildNameOrder } from "../src/lib/nameOrder";
import sharp from "sharp";
import { readdir } from "node:fs/promises";
import path from "node:path";
import type { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/db";

const ALLOWED_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);
const FEATURED_COUNT = 24;
const DAY_MS = 24 * 60 * 60 * 1000;

function shuffle<T>(items: T[]) {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function loadMemes(): Promise<Prisma.MemeCreateManyInput[]> {
  const originalDir = path.join(process.cwd(), "data", "memes", "original");
  const thumbDir = path.join(process.cwd(), "data", "memes", "thumb");
  const [originalFiles, thumbFiles] = await Promise.all([
    readdir(originalDir),
    readdir(thumbDir),
  ]);
  const thumbSet = new Set(thumbFiles);

  const files = originalFiles
    .filter((file) => ALLOWED_EXT.has(path.extname(file).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, "zh-CN"));

  const order = shuffle(Array.from({ length: files.length }, (_, i) => i + 1));
  const start = Date.now() - (files.length - 1) * DAY_MS;

  const rows: Prisma.MemeCreateManyInput[] = [];
  for (const [index, file] of files.entries()) {
    const decoded = sharp(path.join(originalDir, file), {
      animated: true,
      limitInputPixels: 40_000_000,
    });
    const metadata = await decoded.metadata();
    await decoded.stats();
    const ext = path.extname(file);
    const baseName = path.basename(file, ext);
    const type: "ANIMATED" | "STATIC" =
      ext.toLowerCase() === ".gif" || (metadata.pages ?? 1) > 1
        ? "ANIMATED"
        : "STATIC";
    const suffix = type === "ANIMATED" ? "gif" : "jpg";
    const thumbName = `${file}.${suffix}`;
    const hasThumb = thumbSet.has(thumbName);
    const createdAt = new Date(start + (order[index] - 1) * DAY_MS);

    rows.push({
      numId: index + 1,
      title: baseName,
      type,
      mediaUrl: `/memes/original/${file}`,
      thumbUrl: hasThumb
        ? `/memes/thumb/${thumbName}`
        : `/memes/original/${file}`,
      isFeatured: index < FEATURED_COUNT,
      createdAt,
    });
  }
  return rows;
}

async function main() {
  return withMediaWrite(async () => {
    const memes = await loadMemes();
    if (memes.length === 0)
      throw new Error(
        "No source images found; existing records were preserved.",
      );
    const previous = await prisma.meme.findMany({
      select: { mediaUrl: true, thumbUrl: true },
    });
    await withMediaMutation(
      [],
      previous.flatMap((item) => [item.mediaUrl, item.thumbUrl]),
      async () => {},
      async (tx) => {
        await tx.memeTag.deleteMany();
        await tx.tag.deleteMany();
        await tx.meme.deleteMany();
        await tx.meme.createMany({ data: memes });
        await rebuildNameOrder(tx);
      },
    );

    console.log(`Seeded ${memes.length} memes.`);
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
