import "dotenv/config";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
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

async function backfillTable(
  table: "Meme" | "Tag",
  orderBy: string,
  offset: number
) {
  const sql = `
    WITH pending AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY ${orderBy}) AS rn
      FROM "${table}"
      WHERE numId IS NULL
    )
    UPDATE "${table}"
    SET numId = (SELECT rn FROM pending WHERE pending.id = "${table}".id) + ${offset}
    WHERE id IN (SELECT id FROM pending);
  `;
  const updated = await prisma.$executeRawUnsafe(sql);
  return updated;
}

async function main() {
  const memeMax = await prisma.meme.aggregate({ _max: { numId: true } });
  const tagMax = await prisma.tag.aggregate({ _max: { numId: true } });
  const memeOffset = memeMax._max.numId ?? 0;
  const tagOffset = tagMax._max.numId ?? 0;

  const memeUpdated = await backfillTable("Meme", `"createdAt" ASC, "id" ASC`, memeOffset);
  const tagUpdated = await backfillTable("Tag", `"name" ASC, "id" ASC`, tagOffset);

  console.log(`Meme numId backfilled: ${memeUpdated}`);
  console.log(`Tag numId backfilled: ${tagUpdated}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
