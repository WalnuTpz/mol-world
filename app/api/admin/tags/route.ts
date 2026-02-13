import { prisma } from "@/lib/db";
import { successResponse } from "@/lib/api";

const DEFAULT_LIMIT = 20;

function parseIntParam(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

type SortMode = "count_desc" | "count_asc" | "name_asc";

const resolveSort = (value: string | null): SortMode => {
  if (value === "count_asc" || value === "name_asc" || value === "count_desc") {
    return value;
  }
  return "count_desc";
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = parseIntParam(searchParams.get("page"), 1);
  const limit = parseIntParam(searchParams.get("limit"), DEFAULT_LIMIT);
  const q = (searchParams.get("q") ?? "").trim();
  const sort = resolveSort(searchParams.get("sort"));
  const skip = (page - 1) * limit;

  const where = q ? { name: { contains: q } } : {};
  const orderBy =
    sort === "name_asc"
      ? { name: "asc" as const }
      : {
          memes: { _count: sort === "count_asc" ? ("asc" as const) : "desc" },
        };

  const [items, total] = await Promise.all([
    prisma.tag.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      select: {
        id: true,
        name: true,
        _count: { select: { memes: true } },
      },
    }),
    prisma.tag.count({ where }),
  ]);

  const normalized = items.map((item) => ({
    id: item.id,
    name: item.name,
    count: item._count.memes,
  }));

  return successResponse(
    { items: normalized, page, limit, total, q, sort },
    "查询成功"
  );
}
