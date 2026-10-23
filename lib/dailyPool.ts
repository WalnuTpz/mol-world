import { withDatabaseWrite } from "@/lib/databaseWrite";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export const pickRandomSubset = <T>(items: T[], count: number) => {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, count);
};

export const ensureDailyPools = async (
  day: string,
  memeIds: string[] | null,
  groupCount: number,
  groupSize: number,
  rebuild = false,
) => {
  return withDatabaseWrite(() =>
    prisma.$transaction(async (tx) => {
      const total = memeIds
        ? memeIds.length
        : await tx.meme.count({ where: { status: "PUBLISHED" } });
      if (!total) return [];
      const expectedSize = Math.min(groupSize, total);
      const existing = await tx.dailyPool.findMany({
        where: { day },
        include: {
          _count: {
            select: { items: { where: { meme: { status: "PUBLISHED" } } } },
          },
        },
      });

      const shouldRebuild =
        rebuild ||
        existing.length !== groupCount ||
        existing.some((group) => group._count.items !== expectedSize);

      if (shouldRebuild) {
        await tx.dailyPool.deleteMany({ where: { day: { lt: day } } });
        await tx.dailyPoolItem.deleteMany({ where: { pool: { day } } });
        await tx.dailyPool.deleteMany({ where: { day } });

        for (let i = 0; i < groupCount; i += 1) {
          const ids = memeIds
            ? pickRandomSubset(memeIds, groupSize)
            : (
                await tx.$queryRaw<{ id: string }[]>(
                  Prisma.sql`SELECT id FROM Meme WHERE status = 'PUBLISHED' ORDER BY RANDOM() LIMIT ${expectedSize}`,
                )
              ).map((row) => row.id);
          await tx.dailyPool.create({
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
      }

      return tx.dailyPool.findMany({
        where: { day },
        select: {
          groupIndex: true,
          items: { select: { memeId: true } },
        },
      });
    }),
  );
};
