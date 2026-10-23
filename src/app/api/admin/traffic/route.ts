import { prisma } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/api";
import { requireAdmin } from "@/lib/adminAuth";
import { Prisma } from "@prisma/client";
import { publicMediaUrl } from "@/lib/mediaUrl";

const DAY_MS = 86400000;
export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  const range = new URL(request.url).searchParams.get("range") ?? "30d";
  if (!["3d", "7d", "30d", "all"].includes(range))
    return errorResponse("无效的时间范围", 400, "INVALID_RANGE");
  const days = range === "all" ? null : Number.parseInt(range);
  const today = new Date().toISOString().slice(0, 10);
  const dayKeys = days
    ? Array.from({ length: days }, (_, index) =>
        new Date(Date.now() - (days - index - 1) * DAY_MS)
          .toISOString()
          .slice(0, 10),
      )
    : [];
  const where = days ? { day: { gte: dayKeys[0], lte: today } } : {};
  const [stats, visits, top] = await Promise.all([
    prisma.memeDailyStat.groupBy({
      by: ["day"],
      where,
      _sum: { copies: true, downloads: true },
    }),
    prisma.siteDailyStat.findMany({
      where,
      select: { day: true, visits: true, visitors: true },
    }),
    prisma.$queryRaw<
      {
        id: string;
        title: string | null;
        type: string;
        thumbUrl: string;
        heat: bigint;
      }[]
    >`
      SELECT m.id, m.title, m.type, m.thumbUrl, SUM(s.copies + s.downloads) AS heat
      FROM MemeDailyStat s JOIN Meme m ON m.id = s.memeId
      ${days ? Prisma.sql`WHERE s.day >= ${dayKeys[0]} AND s.day <= ${today}` : Prisma.empty}
      GROUP BY m.id ORDER BY heat DESC, m.id DESC LIMIT 30
    `,
  ]);
  if (!days)
    dayKeys.push(
      ...new Set([
        ...stats.map((row) => row.day),
        ...visits.map((row) => row.day),
      ]),
    );
  dayKeys.sort();
  const heatByDay = new Map(
    stats.map((row) => [
      row.day,
      (row._sum.copies ?? 0) + (row._sum.downloads ?? 0),
    ]),
  );
  const visitsByDay = new Map(visits.map((row) => [row.day, row]));
  let cumulative = 0;
  const daily = dayKeys.map((day) => {
    const heat = heatByDay.get(day) ?? 0;
    cumulative += heat;
    return {
      day,
      heat,
      cumulative,
      visits: visitsByDay.get(day)?.visits ?? 0,
      visitors: visitsByDay.get(day)?.visitors ?? 0,
    };
  });
  return successResponse(
    {
      daily,
      top: top.map((item) => ({
        ...item,
        thumbUrl: publicMediaUrl(item.thumbUrl),
        heat: Number(item.heat),
      })),
    },
    "查询成功",
  );
}
