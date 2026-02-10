import "dotenv/config";
import { access, readdir } from "node:fs/promises";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

import { generateThumb } from "../lib/thumbs";

const resolveDbUrl = (rawUrl?: string) => {
  const fallback = `file:${path
    .resolve(process.cwd(), "prisma", "dev.db")
    .replace(/\\/g, "/")}`;
  if (!rawUrl) return fallback;
  if (!rawUrl.startsWith("file:")) return rawUrl;
  const filePath = rawUrl.slice(5);
  if (filePath.startsWith("/") || /^[A-Za-z]:[\\/]/.test(filePath)) {
    return `file:${filePath.replace(/\\/g, "/")}`;
  }
  const absPath = path.resolve(process.cwd(), filePath).replace(/\\/g, "/");
  return `file:${absPath}`;
};

const adapter = new PrismaBetterSqlite3({
  url: resolveDbUrl(process.env.DATABASE_URL),
});

const prisma = new PrismaClient({ adapter });

const ALLOWED_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

const fileExists = async (filePath: string) => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

async function main() {
  const originalDir = path.join(process.cwd(), "public", "memes", "original");
  const thumbDir = path.join(process.cwd(), "public", "memes", "thumb");
  const files = (await readdir(originalDir)).filter((file) =>
    ALLOWED_EXT.has(path.extname(file).toLowerCase())
  );

  let generated = 0;
  let updated = 0;

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const base = path.basename(file, ext);
    const animated = ext === ".gif";
    const thumbName = `${base}.${animated ? "gif" : "jpg"}`;
    const inputPath = path.join(originalDir, file);
    const thumbPath = path.join(thumbDir, thumbName);
    const thumbUrl = `/memes/thumb/${thumbName}`;
    const mediaUrl = `/memes/original/${file}`;

    const meme = await prisma.meme.findFirst({
      where: { mediaUrl },
      select: { id: true },
    });
    if (!meme) continue;

    if (!(await fileExists(thumbPath))) {
      await generateThumb(inputPath, thumbPath, animated);
      generated += 1;
    }

    await prisma.meme.update({
      where: { id: meme.id },
      data: { thumbUrl },
    });
    updated += 1;
  }

  console.log(`Generated ${generated} thumbs, updated ${updated} records.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
