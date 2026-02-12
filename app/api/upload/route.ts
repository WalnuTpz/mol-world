import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { normalizeTagInput } from "@/lib/tags";

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

const getCookieValue = (request: Request, name: string) => {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
};

const isAdminAuthed = (request: Request) => {
  const user = process.env.REVIEW_USER;
  const pass = process.env.REVIEW_PASS;
  if (!user || !pass) return false;
  const token = getCookieValue(request, "admin_session");
  if (!token) return false;
  const expected = Buffer.from(`${user}:${pass}`, "utf8").toString("base64");
  return token === expected;
};

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");
  const rawTitle = formData.get("title");
  const rawTags = formData.get("tags");

  if (!(file instanceof File)) {
    void logAudit({
      action: "upload",
      status: "error",
      message: "缺少文件",
      request,
    });
    return errorResponse("缺少文件", 400, "MISSING_FILE");
  }

  if (file.size > MAX_SIZE) {
    void logAudit({
      action: "upload",
      status: "error",
      message: "文件超过大小限制",
      data: { size: file.size },
      request,
    });
    return errorResponse("文件超过大小限制", 400, "FILE_TOO_LARGE");
  }

  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    void logAudit({
      action: "upload",
      status: "error",
      message: "文件格式不支持",
      data: { type: file.type },
      request,
    });
    return errorResponse("文件格式不支持", 400, "UNSUPPORTED_FILE_TYPE");
  }

  const title =
    typeof rawTitle === "string" && rawTitle.trim().length > 0
      ? rawTitle.trim()
      : null;
  const tags = typeof rawTags === "string" ? normalizeTagInput(rawTags) : [];

  if (title) {
    const existing = await prisma.meme.findFirst({
      where: { title },
      select: { id: true },
    });
    if (existing) {
      void logAudit({
        action: "upload",
        status: "error",
        message: "上传失败（已存在该表情包）",
        data: { title },
        request,
      });
      return errorResponse("上传失败（已存在该表情包）", 409, "DUPLICATE_MEME");
    }
  }

  const pendingCount = await prisma.meme.count({
    where: {
      status: { in: ["PENDING", "HIDDEN"] as const },
      mediaUrl: { startsWith: "/uploads/" },
    },
  });
  if (pendingCount >= REVIEW_QUEUE_LIMIT) {
    void logAudit({
      action: "upload",
      status: "error",
      message: "上传失败（目前审核队列已过载）",
      data: { pendingCount },
      request,
    });
    return errorResponse("上传失败（目前审核队列已过载）", 409, "QUEUE_FULL");
  }

  const clientId = getClientId(request);
  const now = Date.now();
  const isAdmin = isAdminAuthed(request);
  if (!isAdmin) {
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

  const created = await prisma.meme.create({
    data: {
      title,
      type,
      mediaUrl,
      thumbUrl: mediaUrl,
      status: "PENDING",
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
    select: { id: true, title: true },
  });

  uploadCooldown.set(clientId, now);
  lastGlobalUploadAt = now;

  void logAudit({
    action: "upload",
    status: "success",
    targetType: "meme",
    targetId: created.id,
    message: "已提交，等待审核",
    data: { title: created.title ?? null },
    request,
  });

  return successResponse({}, "已提交，等待审核");
  } finally {
    globalUploading = false;
  }
}
