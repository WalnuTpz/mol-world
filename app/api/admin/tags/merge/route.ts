import { prisma } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/api";
import { normalizeTagInput } from "@/lib/tags";

type Payload = {
  from?: string;
  to?: string;
};

const resolveTagByIdOrName = async (value: string) => {
  const byId = await prisma.tag.findUnique({
    where: { id: value },
    select: { id: true, name: true },
  });
  if (byId) return byId;
  const normalized = normalizeTagInput(value);
  if (normalized.length !== 1) {
    return { error: normalized.length === 0 ? "INVALID_TAG" : "MULTI_TAG" } as const;
  }
  const name = normalized[0];
  const byName = await prisma.tag.findUnique({
    where: { name },
    select: { id: true, name: true },
  });
  return byName ?? null;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Payload | null;
  const fromRaw = body?.from?.trim() ?? "";
  const toRaw = body?.to?.trim() ?? "";
  if (!fromRaw || !toRaw) {
    return errorResponse("请求参数不完整", 400, "MISSING_PARAMS");
  }

  const fromResolved = await resolveTagByIdOrName(fromRaw);
  if (!fromResolved || ("error" in fromResolved && fromResolved.error === "INVALID_TAG")) {
    return errorResponse("标签不存在", 404, "TAG_NOT_FOUND");
  }
  if ("error" in fromResolved) {
    return errorResponse("仅支持单个标签", 400, "MULTI_TAG");
  }

  const toResolved = await resolveTagByIdOrName(toRaw);
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
    const createResult =
      links.length > 0
        ? await tx.memeTag.createMany({
            data: links.map((link) => ({
              memeId: link.memeId,
              tagId: toResolved.id,
            })),
            skipDuplicates: true,
          })
        : { count: 0 };

    await tx.memeTag.deleteMany({ where: { tagId: fromResolved.id } });
    await tx.tag.delete({ where: { id: fromResolved.id } });

    const updated = await tx.tag.findUnique({
      where: { id: toResolved.id },
      select: { id: true, name: true, _count: { select: { memes: true } } },
    });

    return {
      merged: links.length,
      added: createResult.count,
      item: updated
        ? { id: updated.id, name: updated.name, count: updated._count.memes }
        : { id: toResolved.id, name: toResolved.name, count: 0 },
    };
  });

  return successResponse(result, "已合并");
}
