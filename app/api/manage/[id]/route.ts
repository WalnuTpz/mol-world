import path from "node:path";
import { mkdir, rename, unlink } from "node:fs/promises";

import { prisma } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/api";
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
