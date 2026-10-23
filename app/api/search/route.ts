import { publicMediaUrl } from "@/lib/mediaUrl";
import { pagination } from "@/lib/pagination";
import { prisma } from "@/lib/db";
import { successResponse } from "@/lib/api";
import { normalizeSearchTokens, sortTags } from "@/lib/tags";
import { buildCacheControl, getAppConfig } from "@/lib/appConfig";

export async function GET(request: Request) {
  const config = await getAppConfig();
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  const { page, limit, skip } = pagination(
    searchParams.get("page"),
    searchParams.get("limit"),
    config.listLimit,
  );

  if (!q) {
    return successResponse({ items: [], page, limit, total: 0, q }, "查询成功");
  }

  const tokens = normalizeSearchTokens(q);
  const where = tokens.length
    ? {
        status: "PUBLISHED" as const,
        AND: tokens.map((token) => ({
          OR: [
            { title: { contains: token } },
            { tags: { some: { tag: { name: { contains: token } } } } },
          ],
        })),
      }
    : {
        status: "PUBLISHED" as const,
      };

  const [items, total] = await Promise.all([
    prisma.meme.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take: limit,
      select: {
        id: true,
        title: true,
        type: true,
        mediaUrl: true,
        thumbUrl: true,
        copies: true,
        downloads: true,
        isFeatured: true,
        createdAt: true,
        tags: {
          select: {
            tag: { select: { name: true } },
          },
        },
      },
    }),
    prisma.meme.count({ where }),
  ]);

  const normalized = items.map((item) => ({
    ...item,
    mediaUrl: publicMediaUrl(item.mediaUrl),
    thumbUrl: publicMediaUrl(item.thumbUrl),
    tags: sortTags(item.tags.map((t) => t.tag.name)),
  }));

  return successResponse(
    { items: normalized, page, limit, total, q },
    "查询成功",
    200,
    { "Cache-Control": buildCacheControl(config.cacheSearchSeconds) },
  );
}
