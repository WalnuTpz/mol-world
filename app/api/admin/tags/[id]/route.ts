import { prisma } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/api";
import { normalizeTagInput } from "@/lib/tags";

type Payload = {
  name?: string;
};

export async function PATCH(
  request: Request,
  context: { params: { id: string } | Promise<{ id: string }> }
) {
  const { id } = await Promise.resolve(context.params);
  if (!id) {
    return errorResponse("请求参数不完整", 400, "MISSING_ID");
  }

  const body = (await request.json().catch(() => null)) as Payload | null;
  const rawName = body?.name ?? "";
  const normalized = normalizeTagInput(rawName);
  if (normalized.length === 0) {
    return errorResponse("标签不能为空", 400, "INVALID_TAG");
  }
  if (normalized.length > 1) {
    return errorResponse("仅支持单个标签", 400, "MULTI_TAG");
  }

  const nextName = normalized[0];
  const current = await prisma.tag.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!current) {
    return errorResponse("标签不存在", 404, "TAG_NOT_FOUND");
  }

  if (current.name === nextName) {
    const item = await prisma.tag.findUnique({
      where: { id },
      select: { id: true, name: true, _count: { select: { memes: true } } },
    });
    return successResponse(
      {
        item: item
          ? { id: item.id, name: item.name, count: item._count.memes }
          : { id, name: nextName, count: 0 },
      },
      "已更新"
    );
  }

  const exists = await prisma.tag.findUnique({
    where: { name: nextName },
    select: { id: true },
  });
  if (exists) {
    return errorResponse("标签已存在", 409, "TAG_EXISTS");
  }

  const updated = await prisma.tag.update({
    where: { id },
    data: { name: nextName },
    select: {
      id: true,
      name: true,
      _count: { select: { memes: true } },
    },
  });

  return successResponse(
    { item: { id: updated.id, name: updated.name, count: updated._count.memes } },
    "已更新"
  );
}
