import { publicMediaUrl } from "@/lib/mediaUrl";
import { pagination } from "@/lib/pagination";
import { prisma } from "@/lib/db";
import { successResponse } from "@/lib/api";
import { requireAdmin } from "@/lib/adminAuth";
import { sortTags } from "@/lib/tags";
import { getAppConfig } from "@/lib/appConfig";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  const config = await getAppConfig();
  const { searchParams } = new URL(request.url);
  const { page, limit, skip } = pagination(
    searchParams.get("page"),
    searchParams.get("limit"),
    config.reviewPageLimit,
  );

  const where = {
    status: "PENDING" as const,
    mediaUrl: {
      startsWith: "/uploads/",
    },
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
        status: true,
        tags: {
          select: {
            tag: {
              select: { name: true },
            },
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

  return successResponse({ items: normalized, page, limit, total }, "查询成功");
}
