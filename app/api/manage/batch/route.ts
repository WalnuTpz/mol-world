import path from "node:path";
import { mkdir, rename } from "node:fs/promises";

import { prisma } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/api";
import { logAudit } from "@/lib/audit";

type Payload = {
  ids?: string[];
  action?: "publish" | "hide" | "delete" | "reset";
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

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Payload | null;
  const ids = Array.isArray(body?.ids) ? body?.ids.filter(Boolean) : [];
  const action = body?.action;

  if (!action || ids.length === 0) {
    return errorResponse("请求参数不完整", 400, "MISSING_PARAMS");
  }

  if (action === "publish" || action === "hide") {
    const status = action === "publish" ? "PUBLISHED" : "HIDDEN";
    const result = await prisma.meme.updateMany({
      where: { id: { in: ids } },
      data: { status },
    });
    void logAudit({
      action: "manage:batch",
      status: "success",
      message: `${status === "PUBLISHED" ? "批量发布" : "批量隐藏"}完成`,
      data: { action, count: result.count },
      request,
    });
    return successResponse({ count: result.count }, "批量更新成功");
  }

  if (action === "reset") {
    const result = await prisma.meme.updateMany({
      where: { id: { in: ids } },
      data: { copies: 0, downloads: 0 },
    });
    void logAudit({
      action: "manage:batch",
      status: "success",
      message: "批量热度清零完成",
      data: { action, count: result.count },
      request,
    });
    return successResponse({ count: result.count }, "批量清零成功");
  }

  let deleted = 0;
  const failed: string[] = [];
  for (const id of ids) {
    const current = await prisma.meme.findUnique({
      where: { id },
      select: {
        id: true,
        mediaUrl: true,
        thumbUrl: true,
      },
    });
    if (!current) {
      failed.push(id);
      continue;
    }

    const timestamp = Date.now();
    const moved: { trashPath: string; sourcePath: string }[] = [];
    try {
      const mediaMoved = await moveToTrash(current.mediaUrl, current.id, timestamp);
      if (mediaMoved) moved.push(mediaMoved);
      const thumbMoved = await moveToTrash(current.thumbUrl, current.id, timestamp);
      if (thumbMoved) moved.push(thumbMoved);

      await prisma.$transaction([
        prisma.memeTag.deleteMany({ where: { memeId: id } }),
        prisma.meme.delete({ where: { id } }),
      ]);
      deleted += 1;
      void logAudit({
        action: "manage:delete",
        status: "success",
        targetType: "meme",
        targetId: id,
        message: "批量删除成功",
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
      failed.push(id);
      void logAudit({
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
    { count: deleted, failed },
    failed.length ? "部分删除失败" : "删除成功"
  );
}
