import "dotenv/config";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

import { APP_CONFIG_DEFAULTS } from "../lib/appConfigDefaults";

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

const getDayKey = () => new Date().toISOString().slice(0, 10);

const pickRandomSubset = <T,>(items: T[], count: number) => {
  if (items.length <= count) return items.slice();
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, count);
};

const loadPoolConfig = async () => {
  let groups = APP_CONFIG_DEFAULTS.dailyPoolGroups;
  let size = APP_CONFIG_DEFAULTS.dailyPoolSize;
  try {
    const rows = await prisma.appConfig.findMany({
      where: {
        key: { in: ["dailyPoolGroups", "dailyPoolSize"] },
      },
      select: { key: true, value: true },
    });
    for (const row of rows) {
      const value = Number(row.value);
      if (!Number.isFinite(value) || value <= 0) continue;
      if (row.key === "dailyPoolGroups") {
        groups = Math.round(value);
      } else if (row.key === "dailyPoolSize") {
        size = Math.round(value);
      }
    }
  } catch (error) {
    console.warn("Failed to read AppConfig, fallback to defaults.");
    console.warn(error);
  }
  return { groups, size };
};

async function main() {
  const day = getDayKey();
  const { groups, size } = await loadPoolConfig();

  if (groups <= 0 || size <= 0) {
    console.log(`Invalid config: groups=${groups}, size=${size}`);
    return;
  }

  const memes = await prisma.meme.findMany({
    where: { status: "PUBLISHED" },
    select: { id: true },
  });
  const memeIds = memes.map((item) => item.id);
  if (memeIds.length === 0) {
    console.log("No published memes found.");
    return;
  }

  await prisma.dailyPoolItem.deleteMany({ where: { pool: { day } } });
  await prisma.dailyPool.deleteMany({ where: { day } });

  let createdItems = 0;
  for (let i = 0; i < groups; i += 1) {
    const ids = pickRandomSubset(memeIds, size);
    createdItems += ids.length;
    await prisma.dailyPool.create({
      data: {
        day,
        groupIndex: i,
        items: {
          create: ids.map((id) => ({
            meme: { connect: { id } },
          })),
        },
      },
    });
  }

  console.log(
    `Rebuilt daily pool for ${day}: ${groups} groups, ${createdItems} items (memes=${memeIds.length}).`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
