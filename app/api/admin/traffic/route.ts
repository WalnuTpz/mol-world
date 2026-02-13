import { prisma } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/api";
import { requireAdmin } from "@/lib/adminAuth";

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

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  try {
    const { searchParams } = new URL(request.url);
    const range = searchParams.get("range") ?? "30d";
    const rangeDays =
      range === "3d" ? 3 : range === "7d" ? 7 : range === "30d" ? 30 : null;
    if (!["3d", "7d", "30d", "all"].includes(range)) {
      return errorResponse("无效的时间范围", 400, "INVALID_RANGE");
    }

    let dayKeys = rangeDays ? buildDayKeys(rangeDays) : [];

    const stats = await prisma.memeDailyStat.findMany({
      where: rangeDays ? { day: { in: dayKeys } } : undefined,
      select: {
        day: true,
        memeId: true,
        copies: true,
        downloads: true,
      },
    });
    const visitStats = await prisma.siteDailyStat.findMany({
      where: rangeDays ? { day: { in: dayKeys } } : undefined,
      select: { day: true, visits: true },
    });

    if (!rangeDays) {
      const unique = new Set<string>();
      for (const row of stats) {
        unique.add(row.day);
      }
      for (const row of visitStats) {
        unique.add(row.day);
      }
      dayKeys = Array.from(unique).sort();
    }

    const dailyTotals = new Map<string, number>();
    const visitTotals = new Map<string, number>();
    const topMap = new Map<string, number>();
    const dayKeySet = rangeDays ? new Set(dayKeys) : null;

    for (const row of stats) {
      const heat = row.copies + row.downloads;
      dailyTotals.set(row.day, (dailyTotals.get(row.day) ?? 0) + heat);
      if (!dayKeySet || dayKeySet.has(row.day)) {
        topMap.set(row.memeId, (topMap.get(row.memeId) ?? 0) + heat);
      }
    }

    for (const row of visitStats) {
      visitTotals.set(row.day, row.visits);
    }

    const daily = [];
    let cumulative = 0;
    for (const day of dayKeys) {
      const heat = dailyTotals.get(day) ?? 0;
      cumulative += heat;
      daily.push({
        day,
        heat,
        cumulative,
        visits: visitTotals.get(day) ?? 0,
      });
    }

    const topIds = Array.from(topMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
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
