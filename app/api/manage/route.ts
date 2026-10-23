import { publicMediaUrl } from "@/lib/mediaUrl";
import { pagination } from "@/lib/pagination";
import { prisma } from "@/lib/db";
import { successResponse } from "@/lib/api";
import { requireAdmin } from "@/lib/adminAuth";
import { normalizeSearchTokens, sortTags } from "@/lib/tags";
import { getAppConfig } from "@/lib/appConfig";

type StatusFilter = "PUBLISHED" | "HIDDEN";
type TypeFilter = "STATIC" | "ANIMATED";

const STATUS_MAP = new Map<string, StatusFilter>([
  ["已发布", "PUBLISHED"],
  ["已隐藏", "HIDDEN"],
]);

const TYPE_MAP = new Map<string, TypeFilter>([
  ["动图", "ANIMATED"],
  ["动态图", "ANIMATED"],
  ["静态", "STATIC"],
  ["静态图", "STATIC"],
]);

const parseManageQuery = (query: string) => {
  const rawTokens = query.split(/[\s,，、;；/|]+/).filter(Boolean);
  let status: StatusFilter | undefined;
  let type: TypeFilter | undefined;
  const remaining: string[] = [];

  for (const raw of rawTokens) {
    const token = raw.trim();
    if (!token) continue;
    const parts = token.split(/[:：=]/);
    if (parts.length >= 2) {
      const key = parts[0]?.trim() ?? "";
      const value = parts.slice(1).join(":").trim();
      if (["状态"].includes(key) && STATUS_MAP.has(value)) {
        status = STATUS_MAP.get(value);
        continue;
      }
      if (["类型"].includes(key) && TYPE_MAP.has(value)) {
        type = TYPE_MAP.get(value);
        continue;
      }
    }

    if (STATUS_MAP.has(token)) {
      status = STATUS_MAP.get(token);
      continue;
    }
    if (TYPE_MAP.has(token)) {
      type = TYPE_MAP.get(token);
      continue;
    }

    remaining.push(token);
  }

  return {
    status,
    type,
    tokens: normalizeSearchTokens(remaining.join(" ")),
  };
};

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  const config = await getAppConfig();
  const { searchParams } = new URL(request.url);
  const { page, limit, skip } = pagination(
    searchParams.get("page"),
    searchParams.get("limit"),
    config.managePageLimit,
  );
  const q = (searchParams.get("q") ?? "").trim();

  const { status, type, tokens } = parseManageQuery(q);

  const where = {
    status: status ? status : { in: ["PUBLISHED", "HIDDEN"] as StatusFilter[] },
    mediaUrl: { not: { startsWith: "/uploads/" } },
    ...(type ? { type } : {}),
    ...(tokens.length
      ? {
          AND: tokens.map((token) => ({
            OR: [
              { title: { contains: token } },
              { tags: { some: { tag: { name: { contains: token } } } } },
            ],
          })),
        }
      : {}),
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
        copies: true,
        downloads: true,
        createdAt: true,
        updatedAt: true,
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
  );
}
