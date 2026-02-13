import "dotenv/config";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { PrismaClient, type Prisma } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

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

  const order = shuffle(Array.from({ length: files.length }, (_, i) => i + 1));
  const start = Date.now() - (files.length - 1) * DAY_MS;

  return files.map((file, index) => {
    const ext = path.extname(file);
    const baseName = path.basename(file, ext);
    const type: "ANIMATED" | "STATIC" =
      ext.toLowerCase() === ".gif" ? "ANIMATED" : "STATIC";
    const thumbName = `${baseName}.jpg`;
    const hasThumb = thumbSet.has(thumbName);
    const createdAt = new Date(start + (order[index] - 1) * DAY_MS);

    return {
      numId: index + 1,
      title: baseName,
      type,
      mediaUrl: `/memes/original/${file}`,
      thumbUrl: hasThumb
        ? `/memes/thumb/${thumbName}`
        : `/memes/original/${file}`,
      isFeatured: index < FEATURED_COUNT,
      createdAt,
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
