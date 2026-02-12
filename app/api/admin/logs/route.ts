import { prisma } from "@/lib/db";
import { successResponse } from "@/lib/api";
import { normalizeSearchTokens } from "@/lib/tags";

const DEFAULT_LIMIT = 20;

function parseIntParam(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = parseIntParam(searchParams.get("page"), 1);
  const limit = parseIntParam(searchParams.get("limit"), DEFAULT_LIMIT);
  const q = (searchParams.get("q") ?? "").trim();
  const skip = (page - 1) * limit;
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const tokens = q ? normalizeSearchTokens(q) : [];
  const timeFilter = { createdAt: { gte: since } };
  const where =
    tokens.length > 0
      ? {
        AND: [
          timeFilter,
          ...tokens.map((token) => ({
            OR: [
              { action: { contains: token } },
              { message: { contains: token } },
              { targetId: { contains: token } },
              { targetType: { contains: token } },
            ],
          })),
        ],
      }
      : timeFilter;

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        action: true,
        status: true,
        targetType: true,
        targetId: true,
        message: true,
        createdAt: true,
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return successResponse(
    {
      items,
      page,
      limit,
      total,
      q,
    },
    "查询成功"
  );
}
