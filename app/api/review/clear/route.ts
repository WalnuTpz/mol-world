import path from "node:path";
import { mkdir, rename } from "node:fs/promises";

import { prisma } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/api";
import { requireAdmin } from "@/lib/adminAuth";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";

const getUploadSource = (mediaUrl: string) => {
  if (!mediaUrl.startsWith("/uploads/")) return null;
  const filename = path.basename(mediaUrl);
  if (!filename) return null;
  const uploadDir = path.join(process.cwd(), "public", "uploads");
  const sourcePath = path.join(uploadDir, filename);
  return { filename, sourcePath };
};

const moveToTrash = async (mediaUrl: string, id: string, timestamp: number) => {
  const source = getUploadSource(mediaUrl);
  if (!source) return null;
  const trashDir = path.join(process.cwd(), "public", "uploads", "trash");
  await mkdir(trashDir, { recursive: true });
  const trashPath = path.join(
    trashDir,
    `${id}-${timestamp}-${source.filename}`
  );
  try {
    await rename(source.sourcePath, trashPath);
    return { trashPath, sourcePath: source.sourcePath };
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
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  const pending = await prisma.meme.findMany({
    where: {
      status: "PENDING" as const,
      mediaUrl: { startsWith: "/uploads/" },
    },
    select: {
      id: true,
      mediaUrl: true,
      thumbUrl: true,
    },
  });

  if (pending.length === 0) {
    void logAudit({
      action: "review:clear",
      status: "success",
      message: "已清空审核队列",
      data: { count: 0 },
      request,
    });
    return successResponse({ count: 0 }, "已清空审核队列");
  }

  const moved: { trashPath: string; sourcePath: string }[] = [];
  const timestamp = Date.now();
  try {
    for (const item of pending) {
      const mediaMoved = await moveToTrash(item.mediaUrl, item.id, timestamp);
      if (mediaMoved) moved.push(mediaMoved);
      const thumbMoved = await moveToTrash(item.thumbUrl, item.id, timestamp);
      if (thumbMoved) moved.push(thumbMoved);
    }

    const ids = pending.map((item) => item.id);
    await prisma.$transaction([
      prisma.memeTag.deleteMany({ where: { memeId: { in: ids } } }),
      prisma.meme.deleteMany({ where: { id: { in: ids } } }),
    ]);

    void logAudit({
      action: "review:clear",
      status: "success",
      message: "已清空审核队列",
      data: { count: pending.length },
      request,
    });
    return successResponse({ count: pending.length }, "已清空审核队列");
  } catch (error) {
    for (const entry of moved) {
      try {
        await restoreFromTrash(entry);
      } catch {
        // ignore
      }
    }
    void logAudit({
      action: "review:clear",
      status: "error",
      message: "清理失败，请重试",
      data: { count: pending.length },
      request,
    });
    return errorResponse("清理失败，请重试", 500, "CLEAR_FAILED");
  }
}
