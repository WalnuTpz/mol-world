import { prisma } from "@/lib/db";
import { successResponse } from "@/lib/api";
import { requireAdmin } from "@/lib/adminAuth";
import { normalizeSearchTokens, sortTags } from "@/lib/tags";
import { getAppConfig, getTagRulesFromConfig } from "@/lib/appConfig";

function parseIntParam(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

type StatusFilter = "PUBLISHED" | "HIDDEN";
type TypeFilter = "STATIC" | "ANIMATED";

const STATUS_MAP = new Map<string, StatusFilter>([
  ["已发布", "PUBLISHED"],
  ["已隐藏", "HIDDEN"],
]);

const TYPE_MAP = new Map<string, TypeFilter>([
  ["动图", "ANIMATED"],
  ["静态", "STATIC"],
]);

const parseManageQuery = (query: string, tagRules?: Parameters<typeof normalizeSearchTokens>[1]) => {
  const rawTokens = query.split(/\s+/).filter(Boolean);
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
    tokens: normalizeSearchTokens(remaining.join(" "), tagRules),
  };
};

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  const config = await getAppConfig();
  const tagRules = getTagRulesFromConfig(config);
  const { searchParams } = new URL(request.url);
  const page = parseIntParam(searchParams.get("page"), 1);
  const limit = parseIntParam(searchParams.get("limit"), config.managePageLimit);
  const q = (searchParams.get("q") ?? "").trim();
  const skip = (page - 1) * limit;

  const { status, type, tokens } = parseManageQuery(q, tagRules);

  const where = {
    status: status ? status : ({ in: ["PUBLISHED", "HIDDEN"] as const } as const),
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
      orderBy: { createdAt: "desc" },
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
    tags: sortTags(item.tags.map((t) => t.tag.name)),
  }));

  return successResponse(
    { items: normalized, page, limit, total, q },
    "查询成功"
  );
}
