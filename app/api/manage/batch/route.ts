import { withDatabaseWrite } from "@/lib/databaseWrite";
import type { Prisma } from "@prisma/client";
import { withTrashedMedia, withMediaWrite } from "@/lib/mediaFiles";
import { prisma } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/api";
import { requireAdmin } from "@/lib/adminAuth";
import { logAudit } from "@/lib/audit";

type Payload = {
  ids?: string[];
  action?: "publish" | "hide" | "delete" | "reset";
};

const MAX_BATCH = 50;

async function post(request: Request) {
  const body = (await request.json().catch(() => null)) as Payload | null;
  const allowedKeys = new Set(["ids", "action"]);
  const extraKeys = Object.keys(body ?? {}).filter(
    (key) => !allowedKeys.has(key),
  );
  if (extraKeys.length > 0) {
    return errorResponse("请求参数不合法", 400, "INVALID_FIELDS");
  }
  if (
    !Array.isArray(body?.ids) ||
    !body.ids.every((id) => typeof id === "string" && id.length > 0)
  ) {
    return errorResponse("资源列表格式不合法", 400, "INVALID_IDS");
  }
  const ids = body.ids;
  const uniqueIds = Array.from(new Set(ids));
  const action = body?.action;

  if (!action || uniqueIds.length === 0) {
    return errorResponse("请求参数不完整", 400, "MISSING_PARAMS");
  }
  if (!["publish", "hide", "delete", "reset"].includes(action)) {
    return errorResponse("操作不合法", 400, "INVALID_ACTION");
  }
  if (uniqueIds.length > MAX_BATCH) {
    return errorResponse(
      `批量数量过多（最多${MAX_BATCH}条）`,
      400,
      "TOO_MANY_IDS",
    );
  }
  const total = uniqueIds.length;

  if (action === "publish" || action === "hide") {
    const status = action === "publish" ? "PUBLISHED" : "HIDDEN";
    const result = await withDatabaseWrite(() =>
      prisma.meme.updateMany({
        where: {
          id: { in: uniqueIds },
          status: { in: ["PUBLISHED", "HIDDEN"] as const },
        },
        data: { status },
      }),
    );
    const success = result.count;
    const failed = total - success;
    await logAudit({
      action: "manage:batch",
      status: "success",
      message: `${status === "PUBLISHED" ? "批量发布" : "批量隐藏"}完成`,
      data: { action, success, failed, total },
      request,
    });
    return successResponse(
      { success, failed, total, count: success },
      "批量更新成功",
    );
  }

  if (action === "reset") {
    const result = await withDatabaseWrite(() =>
      prisma.$transaction(async (tx) => {
        const where: Prisma.MemeWhereInput = {
          id: { in: uniqueIds },
          status: { in: ["PUBLISHED", "HIDDEN"] as const },
        };
        const matching = await tx.meme.findMany({
          where,
          select: { id: true },
        });
        await tx.memeDailyStat.updateMany({
          where: { memeId: { in: matching.map((item) => item.id) } },
          data: { copies: 0, downloads: 0 },
        });
        return tx.meme.updateMany({ where, data: { copies: 0, downloads: 0 } });
      }),
    );
    const success = result.count;
    const failed = total - success;
    await logAudit({
      action: "manage:batch",
      status: "success",
      message: "批量热度清零完成",
      data: { action, success, failed, total },
      request,
    });
    return successResponse(
      { success, failed, total, count: success },
      "批量清零成功",
    );
  }

  let deleted = 0;
  const failed: string[] = [];
  for (const id of uniqueIds) {
    const current = await prisma.meme.findUnique({
      where: { id },
      select: {
        id: true,
        mediaUrl: true,
        thumbUrl: true,
        status: true,
      },
    });
    if (!current) {
      failed.push(id);
      continue;
    }
    if (
      current.status === "PENDING" ||
      current.mediaUrl.startsWith("/uploads/")
    ) {
      failed.push(id);
      continue;
    }

    try {
      await withTrashedMedia(
        [current.mediaUrl, current.thumbUrl],
        async (tx) => {
          await tx.memeTag.deleteMany({ where: { memeId: id } });
          return tx.meme.delete({ where: { id } });
        },
      );
      deleted += 1;
      await logAudit({
        action: "manage:delete",
        status: "success",
        targetType: "meme",
        targetId: id,
        message: "批量删除成功",
        request,
      });
    } catch (error) {
      console.error(error);
      failed.push(id);
      await logAudit({
        action: "manage:delete",
        status: "error",
        targetType: "meme",
        targetId: id,
        message: "批量删除失败",
        request,
      });
    }
  }

  return successResponse(
    {
      success: deleted,
      failed: failed.length,
      total,
      failedIds: failed,
      count: deleted,
    },
    failed.length ? "部分删除失败" : "删除成功",
  );
}

export const POST = async (...args: Parameters<typeof post>) => {
  const auth = await requireAdmin(args[0]);
  if (!auth.ok) return auth.response;
  return withMediaWrite(async () => {
    const current = await requireAdmin(args[0]);
    return current.ok ? post(...args) : current.response;
  });
};
