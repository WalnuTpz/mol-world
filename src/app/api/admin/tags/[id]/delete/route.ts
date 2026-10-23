import { withDatabaseWrite } from "@/lib/databaseWrite";
import { findTagById } from "@/lib/tagQueries";
import { prisma } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/api";
import { requireAdmin } from "@/lib/adminAuth";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
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

  return withDatabaseWrite(() =>
    prisma.$transaction(async (tx) => {
      const tag = await findTagById(tx, rawId);
      if (!tag) {
        return errorResponse("标签不存在", 404, "TAG_NOT_FOUND");
      }

      const removed = await tx.memeTag.deleteMany({ where: { tagId: tag.id } });
      if (mode === "force") {
        await tx.tag.delete({ where: { id: tag.id } });
      }

      return successResponse(
        {
          deleted: true,
          unlinked: removed.count,
          mode,
          tag: { id: tag.id, numId: tag.numId, name: tag.name },
        },
        "已删除",
      );
    }),
  );
}
