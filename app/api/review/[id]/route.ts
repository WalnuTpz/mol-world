import path from "node:path";
import { copyFile, mkdir, rename, unlink } from "node:fs/promises";

import { prisma } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { generateThumb } from "@/lib/thumbs";
import { normalizeTagInput, sortTags } from "@/lib/tags";
import { ensureTagsWithNumId } from "@/lib/numId";
import { getAppConfig, getTagRulesFromConfig } from "@/lib/appConfig";

type Payload = {
  title?: string;
  tags?: string[] | string;
  status?: "PUBLISHED" | "HIDDEN";
  action?: "delete";
};

export const runtime = "nodejs";

const ensureDir = async (dir: string) => {
  await mkdir(dir, { recursive: true });
};

const getUploadSource = (mediaUrl: string) => {
  if (!mediaUrl.startsWith("/uploads/")) return null;
  const filename = path.basename(mediaUrl);
  if (!filename) return null;
  const uploadDir = path.join(process.cwd(), "public", "uploads");
  const sourcePath = path.join(uploadDir, filename);
  return { filename, sourcePath };
};

const moveToLibrary = async (
  id: string,
  mediaUrl: string,
  animated: boolean
) => {
  const source = getUploadSource(mediaUrl);
  if (!source) {
    return null;
  }

  const ext = path.extname(source.filename) || ".png";
  const originalDir = path.join(process.cwd(), "public", "memes", "original");
  const thumbDir = path.join(process.cwd(), "public", "memes", "thumb");
  await ensureDir(originalDir);
  await ensureDir(thumbDir);

  const targetName = `${id}${ext}`;
  const targetPath = path.join(originalDir, targetName);

  const thumbName = `${id}.${animated ? "gif" : "jpg"}`;
  const thumbPath = path.join(thumbDir, thumbName);
  try {
    await rename(source.sourcePath, targetPath);
    await generateThumb(targetPath, thumbPath, animated);
  } catch (error) {
    try {
      await rename(targetPath, source.sourcePath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw err;
      }
    }
    try {
      await unlink(thumbPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw err;
      }
    }
    throw error;
  }

  return {
    mediaUrl: `/memes/original/${targetName}`,
    thumbUrl: `/memes/thumb/${thumbName}`,
    rollback: async () => {
      try {
        await rename(targetPath, source.sourcePath);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
          throw err;
        }
      }
      try {
        await unlink(thumbPath);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
          throw err;
        }
      }
    },
  };
};

const removeFromUploads = async (mediaUrl: string) => {
  const source = getUploadSource(mediaUrl);
  if (!source) return;
  try {
    await unlink(source.sourcePath);
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
  const config = await getAppConfig();
  const tagRules = getTagRulesFromConfig(config);
  const { id } = await Promise.resolve(context.params);
  if (!id) {
    void logAudit({
      action: "review:update",
      status: "error",
      message: "请求参数不完整",
      request,
    });
    return errorResponse("请求参数不完整", 400, "MISSING_ID");
  }

  const rawBody = await request.text();
  if (!rawBody.trim()) {
    void logAudit({
      action: "review:update",
      status: "error",
      message: "请求参数不完整",
      targetType: "meme",
      targetId: id,
      request,
    });
    return errorResponse("请求参数不完整", 400, "EMPTY_BODY");
  }
  let body: Payload;
  try {
    body = JSON.parse(rawBody) as Payload;
  } catch {
    void logAudit({
      action: "review:update",
      status: "error",
      message: "请求参数格式错误",
      targetType: "meme",
      targetId: id,
      request,
    });
    return errorResponse("请求参数格式错误", 400, "INVALID_BODY");
  }
  const title = body.title?.trim() ?? null;
  const status = body.status;
  const tags = body.tags ? normalizeTagInput(body.tags, tagRules) : [];

  if (body.action === "delete") {
    const current = await prisma.meme.findUnique({
      where: { id },
      select: {
        id: true,
        mediaUrl: true,
        thumbUrl: true,
        title: true,
        type: true,
        status: true,
        createdAt: true,
      },
    });

    if (!current) {
      void logAudit({
        action: "review:delete",
        status: "error",
        message: "资源不存在",
        targetType: "meme",
        targetId: id,
        request,
      });
      return errorResponse("资源不存在", 404, "NOT_FOUND");
    }

    let backup: { media?: string; thumb?: string } | null = null;
    const backupDir = path.join(process.cwd(), "public", "uploads", "trash");
    try {
      await ensureDir(backupDir);
      const mediaSource = getUploadSource(current.mediaUrl);
      const thumbSource = getUploadSource(current.thumbUrl);
      const timestamp = Date.now();
      if (mediaSource) {
        const mediaBackup = path.join(
          backupDir,
          `${id}-${timestamp}-${mediaSource.filename}`
        );
        await rename(mediaSource.sourcePath, mediaBackup);
        backup = { ...(backup ?? {}), media: mediaBackup };
      }
      if (thumbSource) {
        const thumbBackup = path.join(
          backupDir,
          `${id}-${timestamp}-${thumbSource.filename}`
        );
        await rename(thumbSource.sourcePath, thumbBackup);
        backup = { ...(backup ?? {}), thumb: thumbBackup };
      }

      await prisma.$transaction([
        prisma.memeTag.deleteMany({ where: { memeId: id } }),
        prisma.meme.delete({ where: { id } }),
      ]);
      void logAudit({
        action: "review:delete",
        status: "success",
        targetType: "meme",
        targetId: id,
        message: "删除成功",
        request,
      });
    } catch (error) {
      if (backup?.media) {
        try {
          const restorePath = getUploadSource(current.mediaUrl)?.sourcePath;
          if (restorePath) {
            await rename(backup.media, restorePath);
          }
        } catch {
          // ignore
        }
      }
      if (backup?.thumb) {
        try {
          const restorePath = getUploadSource(current.thumbUrl)?.sourcePath;
          if (restorePath) {
            await rename(backup.thumb, restorePath);
          }
        } catch {
          // ignore
        }
      }
      void logAudit({
        action: "review:delete",
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
    select: {
      id: true,
      mediaUrl: true,
      type: true,
    },
  });

  let moved: Awaited<ReturnType<typeof moveToLibrary>> = null;
  if (status && current) {
    try {
      moved = await moveToLibrary(
        current.id,
        current.mediaUrl,
        current.type === "ANIMATED"
      );
    } catch {
      void logAudit({
        action: "review:update",
        status: "error",
        targetType: "meme",
        targetId: id,
        message: "文件处理失败，请重试",
        request,
      });
      return errorResponse("文件处理失败，请重试", 500, "FILE_MOVE_FAILED");
    }
  }

  let updated;
  try {
    const tagRows = body.tags ? await ensureTagsWithNumId(prisma, tags) : [];
    updated = await prisma.meme.update({
      where: { id },
      data: {
        title,
        ...(moved ? { mediaUrl: moved.mediaUrl, thumbUrl: moved.thumbUrl } : {}),
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
        createdAt: true,
        tags: {
          select: {
            tag: { select: { name: true } },
          },
        },
      },
    });
  } catch {
    if (moved?.rollback) {
      try {
        await moved.rollback();
      } catch {
        // ignore rollback failures
      }
    }
    void logAudit({
      action: "review:update",
      status: "error",
      targetType: "meme",
      targetId: id,
      message: "保存失败，请重试",
      request,
    });
    return errorResponse("保存失败，请重试", 500, "DB_UPDATE_FAILED");
  }

  void logAudit({
    action: "review:update",
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
