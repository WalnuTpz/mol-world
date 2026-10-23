import { withDatabaseWrite } from "@/lib/databaseWrite";
import { pagination } from "@/lib/pagination";
import { prisma } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/api";
import { requireAdmin } from "@/lib/adminAuth";
import { normalizeSearchTokens } from "@/lib/tags";
import { getAppConfig } from "@/lib/appConfig";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  const config = await getAppConfig();
  const { searchParams } = new URL(request.url);
  const { page, limit, skip } = pagination(
    searchParams.get("page"),
    searchParams.get("limit"),
    config.logPageLimit,
  );
  const q = (searchParams.get("q") ?? "").trim();
  const range = searchParams.get("range") ?? "7d";
  if (!["3d", "7d", "30d", "all"].includes(range))
    return errorResponse("无效的时间范围", 400, "INVALID_RANGE");
  const days = range === "3d" ? 3 : range === "30d" ? 30 : 7;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const tokens = q ? normalizeSearchTokens(q) : [];
  const timeFilter = range === "all" ? {} : { createdAt: { gte: since } };
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
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
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
    "查询成功",
  );
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => null)) as {
    range?: string;
  } | null;
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
  const result = await withDatabaseWrite(() =>
    prisma.auditLog.deleteMany({ where }),
  );

  return successResponse({ count: result.count }, "删除成功");
}
