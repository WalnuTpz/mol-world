import "./env";
import { withDatabaseWrite } from "../lib/databaseWrite";

import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/db";

async function backfillTable(
  client: Prisma.TransactionClient,
  table: "Meme" | "Tag",
  orderBy: string,
  offset: number,
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
  const updated = await client.$executeRawUnsafe(sql);
  return updated;
}

async function main() {
  const { memeUpdated, tagUpdated } = await withDatabaseWrite(() =>
    prisma.$transaction(async (tx) => {
      const memeMax = await tx.meme.aggregate({ _max: { numId: true } });
      const tagMax = await tx.tag.aggregate({ _max: { numId: true } });
      const memeOffset = memeMax._max.numId ?? 0;
      const tagOffset = tagMax._max.numId ?? 0;

      const memeUpdated = await backfillTable(
        tx,
        "Meme",
        `"createdAt" ASC, "id" ASC`,
        memeOffset,
      );
      const tagUpdated = await backfillTable(
        tx,
        "Tag",
        `"name" ASC, "id" ASC`,
        tagOffset,
      );

      return { memeUpdated, tagUpdated };
    }),
  );
  console.log(`Meme numId backfilled: ${memeUpdated}`);
  console.log(`Tag numId backfilled: ${tagUpdated}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
