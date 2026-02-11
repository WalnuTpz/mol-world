import path from "node:path";
import { unlink } from "node:fs/promises";

import { prisma } from "@/lib/db";
import { successResponse } from "@/lib/api";
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

export async function POST(request: Request) {
  const pending = await prisma.meme.findMany({
    where: {
      status: "HIDDEN",
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

  for (const item of pending) {
    await removeFromUploads(item.mediaUrl);
    await removeFromUploads(item.thumbUrl);
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
}
