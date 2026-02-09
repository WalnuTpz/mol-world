import "dotenv/config";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { PrismaClient, type Prisma } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || "file:./prisma/dev.db",
});

const prisma = new PrismaClient({ adapter });

const ALLOWED_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);
const FEATURED_COUNT = 24;

async function loadMemes(): Promise<Prisma.MemeCreateManyInput[]> {
  const originalDir = path.join(process.cwd(), "public", "memes", "original");
  const thumbDir = path.join(process.cwd(), "public", "memes", "thumb");
  const [originalFiles, thumbFiles] = await Promise.all([
    readdir(originalDir),
    readdir(thumbDir),
  ]);
  const thumbSet = new Set(thumbFiles);

  const files = originalFiles
    .filter((file) => ALLOWED_EXT.has(path.extname(file).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, "zh-CN"));

  return files.map((file, index) => {
    const ext = path.extname(file);
    const baseName = path.basename(file, ext);
    const type: "ANIMATED" | "STATIC" =
      ext.toLowerCase() === ".gif" ? "ANIMATED" : "STATIC";
    const thumbName = `${baseName}.jpg`;
    const hasThumb = thumbSet.has(thumbName);

    return {
      title: baseName,
      type,
      mediaUrl: `/memes/original/${file}`,
      thumbUrl: hasThumb
        ? `/memes/thumb/${thumbName}`
        : `/memes/original/${file}`,
      isFeatured: index < FEATURED_COUNT,
    };
  });
}

async function main() {
  await prisma.memeTag.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.meme.deleteMany();

  const memes = await loadMemes();

  await prisma.meme.createMany({ data: memes });

  console.log(`Seeded ${memes.length} memes.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
