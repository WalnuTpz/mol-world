import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/api";
import { normalizeTags } from "@/lib/tags";

export const runtime = "nodejs";

const MAX_SIZE = 10 * 1024 * 1024;
const UPLOAD_COOLDOWN_MS = 60 * 1000;
const GLOBAL_UPLOAD_COOLDOWN_MS = 10 * 1000;
const REVIEW_QUEUE_LIMIT = 100;
const ALLOWED_TYPES: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

const uploadCooldown = new Map<string, number>();
let lastGlobalUploadAt = 0;
let globalUploading = false;

const getClientId = (request: Request) => {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip");
  return ip ?? "unknown";
};

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");
  const rawTitle = formData.get("title");
  const rawTags = formData.get("tags");

  if (!(file instanceof File)) {
    return errorResponse("缺少文件", 400, "MISSING_FILE");
  }

  if (file.size > MAX_SIZE) {
    return errorResponse("文件超过大小限制", 400, "FILE_TOO_LARGE");
  }

  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    return errorResponse("文件格式不支持", 400, "UNSUPPORTED_FILE_TYPE");
  }

  const title =
    typeof rawTitle === "string" && rawTitle.trim().length > 0
      ? rawTitle.trim()
      : null;
  const tags =
    typeof rawTags === "string" ? normalizeTags(rawTags.split(/\s+/)) : [];

  if (title) {
    const existing = await prisma.meme.findFirst({
      where: { title },
      select: { id: true },
    });
    if (existing) {
      return errorResponse("上传失败（已存在该表情包）", 409, "DUPLICATE_MEME");
    }
  }

  const pendingCount = await prisma.meme.count({
    where: {
      status: "HIDDEN",
      mediaUrl: { startsWith: "/uploads/" },
    },
  });
  if (pendingCount >= REVIEW_QUEUE_LIMIT) {
    return errorResponse("上传失败（目前审核队列已过载）", 409, "QUEUE_FULL");
  }

  const clientId = getClientId(request);
  const now = Date.now();
  if (globalUploading || now - lastGlobalUploadAt < GLOBAL_UPLOAD_COOLDOWN_MS) {
    const retryAfter = Math.ceil(
      (GLOBAL_UPLOAD_COOLDOWN_MS - (now - lastGlobalUploadAt)) / 1000
    );
    return errorResponse(
      "操作过于频繁，请稍后再试",
      429,
      "RATE_LIMIT",
      { "Retry-After": String(Math.max(1, retryAfter)) }
    );
  }

  const lastUploadAt = uploadCooldown.get(clientId);
  if (lastUploadAt && now - lastUploadAt < UPLOAD_COOLDOWN_MS) {
    const retryAfter = Math.ceil(
      (UPLOAD_COOLDOWN_MS - (now - lastUploadAt)) / 1000
    );
    return errorResponse(
      "上传过于频繁，请稍后再试",
      429,
      "UPLOAD_RATE_LIMIT",
      { "Retry-After": String(retryAfter) }
    );
  }

  globalUploading = true;
  try {
    const uploadDir = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadDir, { recursive: true });

    const filename = `${crypto.randomUUID()}${ext}`;
    const filePath = path.join(uploadDir, filename);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

  const mediaUrl = `/uploads/${filename}`;
  const type = ext === ".gif" ? "ANIMATED" : "STATIC";

  await prisma.meme.create({
    data: {
      title,
      type,
      mediaUrl,
      thumbUrl: mediaUrl,
      status: "HIDDEN",
      tags: {
        create: tags.map((name) => ({
          tag: {
            connectOrCreate: {
              where: { name },
              create: { name },
            },
          },
        })),
      },
    },
  });

  uploadCooldown.set(clientId, now);
  lastGlobalUploadAt = now;

  return successResponse({}, "已提交，等待审核");
  } finally {
    globalUploading = false;
  }
}
