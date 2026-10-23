import { publicMediaUrl } from "@/lib/mediaUrl";
import { prisma } from "@/lib/db";
import { successResponse } from "@/lib/api";
import { getAppConfig, buildCacheControl } from "@/lib/appConfig";
import { getRandomMemes, getPopularMemes, memeSelect } from "@/lib/memeQueries";
import { sortTags } from "@/lib/tags";

export async function GET(request: Request) {
  const config = await getAppConfig();
  const params = new URL(request.url).searchParams;
  const mode = params.get("mode") ?? "latest";
  const requested = Number(params.get("limit") ?? config.hotLimit);
  const limit =
    Number.isSafeInteger(requested) && requested > 0
      ? Math.min(requested, config.hotLimit)
      : config.hotLimit;
  let rows;
  if (mode === "random") {
    rows = await getRandomMemes(limit);
  } else if (mode === "hot") {
    rows = await getPopularMemes(limit);
  } else {
    rows = await prisma.meme.findMany({
      where: { status: "PUBLISHED" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
      select: memeSelect,
    });
  }
  const items = rows.map((item) => ({
    ...item,
    mediaUrl: publicMediaUrl(item.mediaUrl),
    thumbUrl: publicMediaUrl(item.thumbUrl),
    tags: sortTags(item.tags.map((link) => link.tag.name)),
  }));
  return successResponse({ items, mode, limit }, "查询成功", 200, {
    "Cache-Control":
      mode === "random"
        ? "no-store"
        : buildCacheControl(config.cacheHotSeconds),
  });
}
