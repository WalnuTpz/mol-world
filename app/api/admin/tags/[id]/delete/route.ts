import { prisma } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/api";

export async function DELETE(
  request: Request,
  context: { params: { id: string } | Promise<{ id: string }> }
) {
  const { id } = await Promise.resolve(context.params);
  if (!id) {
    return errorResponse("请求参数不完整", 400, "MISSING_ID");
  }

  const { searchParams } = new URL(request.url);
  const mode = (searchParams.get("mode") ?? "unlink").toLowerCase();
  if (mode !== "unlink" && mode !== "force") {
    return errorResponse("无效的删除模式", 400, "INVALID_MODE");
  }

  const tag = await prisma.tag.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!tag) {
    return errorResponse("标签不存在", 404, "TAG_NOT_FOUND");
  }

  const result = await prisma.$transaction(async (tx) => {
    const removed = await tx.memeTag.deleteMany({ where: { tagId: id } });
    if (mode === "force") {
      await tx.tag.delete({ where: { id } });
    }
    return removed.count;
  });

  return successResponse(
    { deleted: true, unlinked: result, mode, tag: { id: tag.id, name: tag.name } },
    "已删除"
  );
}
