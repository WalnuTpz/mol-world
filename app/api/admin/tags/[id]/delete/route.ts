import { prisma } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/api";
import { requireAdmin } from "@/lib/adminAuth";

const resolveTagByParam = async (value: string) => {
  if (/^\d+$/.test(value)) {
    return prisma.tag.findUnique({
      where: { numId: Number(value) },
      select: { id: true, name: true, numId: true },
    });
  }
  return prisma.tag.findUnique({
    where: { id: value },
    select: { id: true, name: true, numId: true },
  });
};

export async function DELETE(
  request: Request,
  context: { params: { id: string } | Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  const { id: rawId } = await Promise.resolve(context.params);
  if (!rawId) {
    return errorResponse("请求参数不完整", 400, "MISSING_ID");
  }

  const { searchParams } = new URL(request.url);
  const mode = (searchParams.get("mode") ?? "unlink").toLowerCase();
  if (mode !== "unlink" && mode !== "force") {
    return errorResponse("无效的删除模式", 400, "INVALID_MODE");
  }

  const tag = await resolveTagByParam(rawId);
  if (!tag) {
    return errorResponse("标签不存在", 404, "TAG_NOT_FOUND");
  }

  const result = await prisma.$transaction(async (tx) => {
    const removed = await tx.memeTag.deleteMany({ where: { tagId: tag.id } });
    if (mode === "force") {
      await tx.tag.delete({ where: { id: tag.id } });
    }
    return removed.count;
  });

  return successResponse(
    {
      deleted: true,
      unlinked: result,
      mode,
      tag: { id: tag.id, numId: tag.numId, name: tag.name },
    },
    "已删除"
  );
}
