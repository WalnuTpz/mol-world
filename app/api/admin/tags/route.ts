import { prisma } from "@/lib/db";
import { successResponse } from "@/lib/api";
import { requireAdmin } from "@/lib/adminAuth";
import { getAppConfig } from "@/lib/appConfig";

function parseIntParam(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

type SortMode = "count_desc" | "count_asc" | "name_asc" | "name_desc";

const resolveSort = (value: string | null): SortMode => {
  if (
    value === "count_asc" ||
    value === "count_desc" ||
    value === "name_asc" ||
    value === "name_desc"
  ) {
    return value;
  }
  return "count_desc";
};

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  const config = await getAppConfig();
  const { searchParams } = new URL(request.url);
  const page = parseIntParam(searchParams.get("page"), 1);
  const limit = Math.min(
    parseIntParam(searchParams.get("limit"), config.tagPageLimit),
    config.tagPageLimit
  );
  const q = (searchParams.get("q") ?? "").trim();
  const sort = resolveSort(searchParams.get("sort"));
  const skip = (page - 1) * limit;

  const where = q ? { name: { contains: q } } : {};
  const countOrder: "asc" | "desc" = sort === "count_asc" ? "asc" : "desc";
  const orderBy =
    sort === "name_asc"
      ? { name: "asc" as const }
      : sort === "name_desc"
        ? { name: "desc" as const }
        : { memes: { _count: countOrder } };

  const [items, total] = await Promise.all([
    prisma.tag.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      select: {
        id: true,
        numId: true,
        name: true,
        _count: { select: { memes: true } },
      },
    }),
    prisma.tag.count({ where }),
  ]);

  const normalized = items.map((item) => ({
    id: item.id,
    numId: item.numId,
    name: item.name,
    count: item._count.memes,
  }));

  return successResponse(
    { items: normalized, page, limit, total, q, sort },
    "查询成功"
  );
}
