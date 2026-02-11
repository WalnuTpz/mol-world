import "dotenv/config";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

import { normalizeTags } from "../lib/tags";

const TAGS = [
  "对称",
  "快速",
  "慢速",
  "跳动",
  "变色",
  "发光",
  "旋转",
  "万花筒",
  "爆炸",
  "地面",
  "像素",
];

const MAX_TAGS = 8;

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

async function main() {
  const memes = await prisma.meme.findMany({
    select: {
      id: true,
      title: true,
      tags: {
        select: {
          tag: { select: { name: true } },
        },
      },
    },
  });

  let updated = 0;

  for (const meme of memes) {
    const title = meme.title?.trim() ?? "";
    if (!title) continue;

    const matches = TAGS.filter((tag) => title.includes(tag));
    if (matches.length === 0) continue;

    const normalizedMatches = normalizeTags(matches, 99);
    const existing = meme.tags.map((t) => t.tag.name);
    const existingSet = new Set(existing);

    if (existing.length >= MAX_TAGS) continue;

    const toAdd: string[] = [];
    for (const tag of normalizedMatches) {
      if (existingSet.has(tag)) continue;
      toAdd.push(tag);
      if (existing.length + toAdd.length >= MAX_TAGS) break;
    }

    if (toAdd.length === 0) continue;

    await prisma.meme.update({
      where: { id: meme.id },
      data: {
        tags: {
          create: toAdd.map((name) => ({
            tag: {
              connectOrCreate: {
                where: { name },
                create: { name },
              },
            },
          })),
        },
      },
    });

    updated += 1;
  }

  console.log(`Updated ${updated} memes with title-based tags.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
