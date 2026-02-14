import { prisma } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/api";
import { requireAdmin } from "@/lib/adminAuth";
import { normalizeTagInput } from "@/lib/tags";
import { getAppConfig, getTagRulesFromConfig } from "@/lib/appConfig";

type Payload = {
  from?: string;
  to?: string;
};

const resolveTagByIdOrName = async (
  value: string,
  tagRules: Parameters<typeof normalizeTagInput>[1]
) => {
  if (/^\d+$/.test(value)) {
    const byNum = await prisma.tag.findUnique({
      where: { numId: Number(value) },
      select: { id: true, name: true, numId: true },
    });
    if (byNum) return byNum;
  }
  const byId = await prisma.tag.findUnique({
    where: { id: value },
    select: { id: true, name: true, numId: true },
  });
  if (byId) return byId;
  const normalized = normalizeTagInput(value, tagRules);
  if (normalized.length !== 1) {
    return { error: normalized.length === 0 ? "INVALID_TAG" : "MULTI_TAG" } as const;
  }
  const name = normalized[0];
  const byName = await prisma.tag.findUnique({
    where: { name },
    select: { id: true, name: true, numId: true },
  });
  return byName ?? null;
};

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  const config = await getAppConfig();
  const tagRules = getTagRulesFromConfig(config);
  const body = (await request.json().catch(() => null)) as Payload | null;
  const allowedKeys = new Set(["from", "to"]);
  const extraKeys = Object.keys(body ?? {}).filter((key) => !allowedKeys.has(key));
  if (extraKeys.length > 0) {
    return errorResponse("请求参数不合法", 400, "INVALID_FIELDS");
  }
  const fromRaw = body?.from?.trim() ?? "";
  const toRaw = body?.to?.trim() ?? "";
  if (!fromRaw || !toRaw) {
    return errorResponse("请求参数不完整", 400, "MISSING_PARAMS");
  }

  const fromResolved = await resolveTagByIdOrName(fromRaw, tagRules);
  if (!fromResolved || ("error" in fromResolved && fromResolved.error === "INVALID_TAG")) {
    return errorResponse("标签不存在", 404, "TAG_NOT_FOUND");
  }
  if ("error" in fromResolved) {
    return errorResponse("仅支持单个标签", 400, "MULTI_TAG");
  }

  const toResolved = await resolveTagByIdOrName(toRaw, tagRules);
  if (!toResolved || ("error" in toResolved && toResolved.error === "INVALID_TAG")) {
    return errorResponse("标签不存在", 404, "TAG_NOT_FOUND");
  }
  if ("error" in toResolved) {
    return errorResponse("仅支持单个标签", 400, "MULTI_TAG");
  }

  if (fromResolved.id === toResolved.id) {
    return errorResponse("不能合并相同标签", 400, "SAME_TAG");
  }

  const result = await prisma.$transaction(async (tx) => {
    const links = await tx.memeTag.findMany({
      where: { tagId: fromResolved.id },
      select: { memeId: true },
    });
    const toCreate =
      links.length > 0
        ? await tx.memeTag
            .findMany({
              where: {
                tagId: toResolved.id,
                memeId: { in: links.map((link) => link.memeId) },
              },
              select: { memeId: true },
            })
            .then((existing) => {
              const existingSet = new Set(existing.map((item) => item.memeId));
              return links.filter((link) => !existingSet.has(link.memeId));
            })
        : [];

    const createResult =
      toCreate.length > 0
        ? await tx.memeTag.createMany({
            data: toCreate.map((link) => ({
              memeId: link.memeId,
              tagId: toResolved.id,
            })),
          })
        : { count: 0 };

    await tx.memeTag.deleteMany({ where: { tagId: fromResolved.id } });
    await tx.tag.delete({ where: { id: fromResolved.id } });

    const updated = await tx.tag.findUnique({
      where: { id: toResolved.id },
      select: {
        id: true,
        name: true,
        numId: true,
        _count: { select: { memes: true } },
      },
    });

    return {
      merged: links.length,
      added: createResult.count,
      item: updated
        ? {
            id: updated.id,
            numId: updated.numId,
            name: updated.name,
            count: updated._count.memes,
          }
        : {
            id: toResolved.id,
            numId: toResolved.numId,
            name: toResolved.name,
            count: 0,
          },
    };
  });

  return successResponse(result, "已合并");
}
