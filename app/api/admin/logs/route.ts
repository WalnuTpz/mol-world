import { prisma } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/api";
import { normalizeSearchTokens } from "@/lib/tags";
import { getAppConfig, getTagRulesFromConfig } from "@/lib/appConfig";

function parseIntParam(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function GET(request: Request) {
  const config = await getAppConfig();
  const tagRules = getTagRulesFromConfig(config);
  const { searchParams } = new URL(request.url);
  const page = parseIntParam(searchParams.get("page"), 1);
  const limit = parseIntParam(searchParams.get("limit"), config.logPageLimit);
  const q = (searchParams.get("q") ?? "").trim();
  const skip = (page - 1) * limit;
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const tokens = q ? normalizeSearchTokens(q, tagRules) : [];
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

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { range?: string }
    | null;
  const range = body?.range ?? "";
  const now = Date.now();
  const since =
    range === "3d"
      ? new Date(now - 3 * 24 * 60 * 60 * 1000)
      : range === "7d"
        ? new Date(now - 7 * 24 * 60 * 60 * 1000)
        : range === "30d"
          ? new Date(now - 30 * 24 * 60 * 60 * 1000)
          : null;

  if (!["3d", "7d", "30d", "all"].includes(range)) {
    return errorResponse("无效的删除范围", 400, "INVALID_RANGE");
  }

  const where = since ? { createdAt: { gte: since } } : {};
  const result = await prisma.auditLog.deleteMany({ where });

  return successResponse(
    { count: result.count },
    "删除成功"
  );
}
