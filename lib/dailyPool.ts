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
  memeIds: string[],
  groupCount: number,
  groupSize: number,
  rebuild = false,
) => {
  if (memeIds.length === 0) return [];

  return prisma.$transaction(async (tx) => {
    const expectedSize = Math.min(groupSize, memeIds.length);
    const existing = await tx.dailyPool.findMany({
      where: { day },
      include: { _count: { select: { items: true } } },
    });

    const shouldRebuild =
      rebuild ||
      existing.length !== groupCount ||
      existing.some((group) => group._count.items !== expectedSize);

    if (shouldRebuild) {
      await tx.dailyPoolItem.deleteMany({ where: { pool: { day } } });
      await tx.dailyPool.deleteMany({ where: { day } });

      for (let i = 0; i < groupCount; i += 1) {
        const ids = pickRandomSubset(memeIds, groupSize);
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
  });
};
