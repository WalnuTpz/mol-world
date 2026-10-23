import { withTrashedMedia, withMediaWrite } from "@/lib/mediaFiles";
import { prisma } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/api";
import { requireAdmin } from "@/lib/adminAuth";
import { logAudit } from "@/lib/audit";
import { normalizeTagInput, sortTags } from "@/lib/tags";
import { ensureTagsWithNumId } from "@/lib/numId";
import { getAppConfig, getTagRulesFromConfig } from "@/lib/appConfig";

type Payload = {
  title?: string;
  tags?: string[] | string;
  status?: "PUBLISHED" | "HIDDEN";
  action?: "delete";
};

async function patch(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  const config = await getAppConfig();
  const tagRules = getTagRulesFromConfig(config);
  const { id } = await Promise.resolve(context.params);
  if (!id) {
    void logAudit({
      action: "manage:update",
      status: "error",
      message: "请求参数不完整",
      request,
    });
    return errorResponse("请求参数不完整", 400, "MISSING_ID");
  }

  const body = (await request.json().catch(() => null)) as Payload | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return errorResponse("请求参数格式错误", 400, "INVALID_BODY");
  }
  const allowedKeys = new Set(["title", "tags", "status", "action"]);
  const extraKeys = Object.keys(body ?? {}).filter(
    (key) => !allowedKeys.has(key),
  );
  if (extraKeys.length > 0) {
    void logAudit({
      action: "manage:update",
      status: "error",
      message: "请求参数不合法",
      targetType: "meme",
      targetId: id,
      data: { extraKeys },
      request,
    });
    return errorResponse("请求参数不合法", 400, "INVALID_FIELDS");
  }
  const status = body.status;
  if (typeof body.title !== "undefined" && typeof body.title !== "string") {
    return errorResponse("标题格式不合法", 400, "INVALID_TITLE");
  }
  if (
    typeof body.tags !== "undefined" &&
    !(
      typeof body.tags === "string" ||
      (Array.isArray(body.tags) &&
        body.tags.every((tag) => typeof tag === "string"))
    )
  ) {
    return errorResponse("标签格式不合法", 400, "INVALID_TAGS");
  }
  if (status !== undefined && status !== "PUBLISHED" && status !== "HIDDEN") {
    return errorResponse("状态不合法", 400, "INVALID_STATUS");
  }
  if (body.action !== undefined && body.action !== "delete") {
    return errorResponse("操作不合法", 400, "INVALID_ACTION");
  }
  const title =
    body.title === undefined ? undefined : body.title.trim() || null;
  const tags =
    body.tags !== undefined ? normalizeTagInput(body.tags, tagRules) : [];

  if (body.action === "delete") {
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
      void logAudit({
        action: "manage:delete",
        status: "error",
        message: "资源不存在",
        targetType: "meme",
        targetId: id,
        request,
      });
      return errorResponse("资源不存在", 404, "NOT_FOUND");
    }
    if (
      current.status === "PENDING" ||
      current.mediaUrl.startsWith("/uploads/")
    ) {
      void logAudit({
        action: "manage:delete",
        status: "error",
        message: "当前状态不可管理",
        targetType: "meme",
        targetId: id,
        request,
      });
      return errorResponse("当前状态不可管理", 400, "INVALID_STATE");
    }

    try {
      await withTrashedMedia([current.mediaUrl, current.thumbUrl], () =>
        prisma.$transaction([
          prisma.memeTag.deleteMany({ where: { memeId: id } }),
          prisma.meme.delete({ where: { id } }),
        ]),
      );
      void logAudit({
        action: "manage:delete",
        status: "success",
        targetType: "meme",
        targetId: id,
        message: "删除成功",
        request,
      });
    } catch (error) {
      console.error(error);
      void logAudit({
        action: "manage:delete",
        status: "error",
        targetType: "meme",
        targetId: id,
        message: "删除失败，请重试",
        request,
      });
      return errorResponse("删除失败，请重试", 500, "DELETE_FAILED");
    }

    return successResponse({}, "删除成功");
  }

  const current = await prisma.meme.findUnique({
    where: { id },
    select: { id: true, status: true, mediaUrl: true },
  });
  if (!current) {
    void logAudit({
      action: "manage:update",
      status: "error",
      message: "资源不存在",
      targetType: "meme",
      targetId: id,
      request,
    });
    return errorResponse("资源不存在", 404, "NOT_FOUND");
  }
  if (
    current.status === "PENDING" ||
    current.mediaUrl.startsWith("/uploads/")
  ) {
    void logAudit({
      action: "manage:update",
      status: "error",
      message: "当前状态不可管理",
      targetType: "meme",
      targetId: id,
      request,
    });
    return errorResponse("当前状态不可管理", 400, "INVALID_STATE");
  }

  const result = await prisma.$transaction(async (tx) => {
    const tagRows = tags.length > 0 ? await ensureTagsWithNumId(tx, tags) : [];
    return tx.meme.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title } : {}),
        ...(status ? { status } : {}),
        ...(body.tags !== undefined
          ? {
              tags: {
                deleteMany: {},
                create: tagRows.map((tag) => ({
                  tag: { connect: { id: tag.id } },
                })),
              },
            }
          : {}),
      },
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
    });
  });
  const updated = result;

  void logAudit({
    action: "manage:update",
    status: "success",
    targetType: "meme",
    targetId: id,
    message: "保存成功",
    data: { status: updated.status },
    request,
  });

  return successResponse(
    {
      item: {
        ...updated,
        tags: sortTags(updated.tags.map((t) => t.tag.name)),
      },
    },
    "保存成功",
  );
}

export const PATCH = (...args: Parameters<typeof patch>) =>
  withMediaWrite(() => patch(...args));
