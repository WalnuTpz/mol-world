import { prisma } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/api";

const DAY_MS = 24 * 60 * 60 * 1000;

const buildDayKeys = (days: number) => {
  const keys: string[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(now.getTime() - i * DAY_MS);
    keys.push(date.toISOString().slice(0, 10));
  }
  return keys;
};

export async function GET() {
  try {
    const dayKeys30 = buildDayKeys(30);
    const dayKeys7 = dayKeys30.slice(-7);

    const stats = await prisma.memeDailyStat.findMany({
      where: { day: { in: dayKeys30 } },
      select: {
        day: true,
        memeId: true,
        copies: true,
        downloads: true,
      },
    });

    const dailyTotals = new Map<string, number>();
    const topMap = new Map<string, number>();
    const dayKeySet7 = new Set(dayKeys7);

    for (const row of stats) {
      const heat = row.copies + row.downloads;
      dailyTotals.set(row.day, (dailyTotals.get(row.day) ?? 0) + heat);
      if (dayKeySet7.has(row.day)) {
        topMap.set(row.memeId, (topMap.get(row.memeId) ?? 0) + heat);
      }
    }

    const daily = [];
    let cumulative = 0;
    for (const day of dayKeys30) {
      const heat = dailyTotals.get(day) ?? 0;
      cumulative += heat;
      daily.push({ day, heat, cumulative });
    }

    const topIds = Array.from(topMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id]) => id);

    const topItems =
      topIds.length > 0
        ? await prisma.meme.findMany({
            where: { id: { in: topIds } },
            select: {
              id: true,
              title: true,
              type: true,
              thumbUrl: true,
            },
          })
        : [];

    const topMapById = new Map(topItems.map((item) => [item.id, item]));
    const top = topIds
      .map((id) => {
        const item = topMapById.get(id);
        if (!item) return null;
        return {
          ...item,
          heat: topMap.get(id) ?? 0,
        };
      })
      .filter(Boolean);

    return successResponse({ top, daily }, "查询成功");
  } catch (error) {
    const message = error instanceof Error ? error.message : "查询失败";
    return errorResponse(message, 500);
  }
}
