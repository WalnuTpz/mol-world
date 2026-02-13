import path from "node:path";
import { mkdir, rename, unlink } from "node:fs/promises";

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

const resolveDeletePath = (url: string) => {
  const normalized = url.trim();
  if (normalized.startsWith("/memes/original/")) {
    const name = path.basename(normalized);
    if (!name) return null;
    return path.join(process.cwd(), "public", "memes", "original", name);
  }
  if (normalized.startsWith("/memes/thumb/")) {
    const name = path.basename(normalized);
    if (!name) return null;
    return path.join(process.cwd(), "public", "memes", "thumb", name);
  }
  if (normalized.startsWith("/uploads/")) {
    const name = path.basename(normalized);
    if (!name) return null;
    return path.join(process.cwd(), "public", "uploads", name);
  }
  return null;
};

const moveToTrash = async (url: string, id: string, timestamp: number) => {
  const sourcePath = resolveDeletePath(url);
  if (!sourcePath) return null;
  const filename = path.basename(sourcePath);
  if (!filename) return null;
  const trashDir = path.join(process.cwd(), "public", "trash");
  await mkdir(trashDir, { recursive: true });
  const trashPath = path.join(trashDir, `${id}-${timestamp}-${filename}`);
  try {
    await rename(sourcePath, trashPath);
    return { trashPath, sourcePath };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
};

const restoreFromTrash = async (entry: { trashPath: string; sourcePath: string }) => {
  try {
    await rename(entry.trashPath, entry.sourcePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
};

export async function PATCH(
  request: Request,
  context: { params: { id: string } | Promise<{ id: string }> }
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

  const body = (await request.json()) as Payload;
  const allowedKeys = new Set(["title", "tags", "status", "action"]);
  const extraKeys = Object.keys(body ?? {}).filter((key) => !allowedKeys.has(key));
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
  const title = body.title?.trim() ?? null;
  const status = body.status;
  if (typeof body.title !== "undefined" && typeof body.title !== "string") {
    return errorResponse("标题格式不合法", 400, "INVALID_TITLE");
  }
  if (
    typeof body.tags !== "undefined" &&
    !(typeof body.tags === "string" || Array.isArray(body.tags))
  ) {
    return errorResponse("标签格式不合法", 400, "INVALID_TAGS");
  }
  if (status && status !== "PUBLISHED" && status !== "HIDDEN") {
    return errorResponse("状态不合法", 400, "INVALID_STATUS");
  }
  if (body.action && body.action !== "delete") {
    return errorResponse("操作不合法", 400, "INVALID_ACTION");
  }
  const tags = body.tags ? normalizeTagInput(body.tags, tagRules) : [];

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

    const timestamp = Date.now();
    const moved: { trashPath: string; sourcePath: string }[] = [];
    try {
      const mediaMoved = await moveToTrash(
        current.mediaUrl,
        current.id,
        timestamp
      );
      if (mediaMoved) moved.push(mediaMoved);
      const thumbMoved = await moveToTrash(
        current.thumbUrl,
        current.id,
        timestamp
      );
      if (thumbMoved) moved.push(thumbMoved);

      await prisma.$transaction([
        prisma.memeTag.deleteMany({ where: { memeId: id } }),
        prisma.meme.delete({ where: { id } }),
      ]);
      void logAudit({
        action: "manage:delete",
        status: "success",
        targetType: "meme",
        targetId: id,
        message: "删除成功",
        request,
      });
    } catch {
      for (const entry of moved) {
        try {
          await restoreFromTrash(entry);
        } catch {
          // ignore
        }
      }
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
  if (current.status === "PENDING" || current.mediaUrl.startsWith("/uploads/")) {
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

  const tagRows = tags.length > 0 ? await ensureTagsWithNumId(prisma, tags) : [];
  const updated = await prisma.meme.update({
    where: { id },
    data: {
      ...(body.title !== undefined ? { title } : {}),
      ...(status ? { status } : {}),
      ...(body.tags
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
      tags: {
        select: {
          tag: { select: { name: true } },
        },
      },
    },
  });

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
    "保存成功"
  );
}
