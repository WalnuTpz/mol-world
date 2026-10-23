import sharp from "sharp";
import { withMediaWrite } from "@/lib/mediaFiles";
import path from "node:path";
import { mkdir, writeFile, unlink } from "node:fs/promises";

import { prisma } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { normalizeTagInput } from "@/lib/tags";
import { ensureTagsWithNumId, getNextMemeNumId } from "@/lib/numId";
import { getAppConfig, getTagRulesFromConfig } from "@/lib/appConfig";
import {
  getAdminSessionCookieName,
  isAdminSessionValid,
} from "@/lib/adminSession";

export const runtime = "nodejs";

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
  const ip =
    forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip");
  return ip ?? "unknown";
};

const getCookieValue = (request: Request, name: string) => {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
};

const isAdminAuthed = async (request: Request) => {
  const token = getCookieValue(request, getAdminSessionCookieName());
  return isAdminSessionValid(token);
};

async function post(request: Request) {
  const config = await getAppConfig();
  const tagRules = getTagRulesFromConfig(config);
  const maxSize = config.uploadMaxSizeMb * 1024 * 1024;
  const uploadCooldownMs = config.uploadCooldownSeconds * 1000;
  const globalCooldownMs = config.uploadGlobalCooldownSeconds * 1000;
  const reviewQueueLimit = config.reviewQueueLimit;
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse("上传数据格式错误", 400, "INVALID_BODY");
  }
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

  if (file.size > maxSize) {
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

  const buffer = Buffer.from(await file.arrayBuffer());
  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(buffer, { animated: true }).metadata();
  } catch {
    return errorResponse("图片数据无效", 400, "INVALID_IMAGE");
  }
  if (
    metadata.format !==
    (
      {
        ".png": "png",
        ".jpg": "jpeg",
        ".gif": "gif",
        ".webp": "webp",
      } as Record<string, string>
    )[ext]
  ) {
    return errorResponse("图片内容与格式不符", 400, "INVALID_IMAGE");
  }

  const title =
    typeof rawTitle === "string" && rawTitle.trim().length > 0
      ? rawTitle.trim()
      : null;
  const tags =
    typeof rawTags === "string" ? normalizeTagInput(rawTags, tagRules) : [];

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
  if (pendingCount >= reviewQueueLimit) {
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
  const isAdmin = await isAdminAuthed(request);
  if (!isAdmin) {
    if (globalUploading || now - lastGlobalUploadAt < globalCooldownMs) {
      const retryAfter = Math.ceil(
        (globalCooldownMs - (now - lastGlobalUploadAt)) / 1000,
      );
      return errorResponse("操作过于频繁，请稍后再试", 429, "RATE_LIMIT", {
        "Retry-After": String(Math.max(1, retryAfter)),
      });
    }

    const lastUploadAt = uploadCooldown.get(clientId);
    if (lastUploadAt && now - lastUploadAt < uploadCooldownMs) {
      const retryAfter = Math.ceil(
        (uploadCooldownMs - (now - lastUploadAt)) / 1000,
      );
      return errorResponse(
        "上传过于频繁，请稍后再试",
        429,
        "UPLOAD_RATE_LIMIT",
        { "Retry-After": String(retryAfter) },
      );
    }
  }

  if (!isAdmin) globalUploading = true;
  let writtenPath: string | undefined;
  try {
    const uploadDir = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadDir, { recursive: true });

    const filename = `${crypto.randomUUID()}${ext}`;
    const filePath = path.join(uploadDir, filename);
    await writeFile(filePath, buffer);
    writtenPath = filePath;

    const mediaUrl = `/uploads/${filename}`;
    const type =
      ext === ".gif" || (metadata.pages ?? 1) > 1 ? "ANIMATED" : "STATIC";

    const created = await prisma.$transaction(async (tx) => {
      const numId = await getNextMemeNumId(tx);
      const tagRows = await ensureTagsWithNumId(tx, tags);
      return tx.meme.create({
        data: {
          numId,
          title,
          type,
          mediaUrl,
          thumbUrl: mediaUrl,
          status: "PENDING",
          tags:
            tagRows.length > 0
              ? {
                  create: tagRows.map((tag) => ({
                    tag: { connect: { id: tag.id } },
                  })),
                }
              : undefined,
        },
        select: { id: true, title: true },
      });
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
  } catch (error) {
    if (writtenPath) await unlink(writtenPath);
    console.error("Upload failed", error);
    return errorResponse("上传失败，请重试", 500, "UPLOAD_FAILED");
  } finally {
    if (!isAdmin) globalUploading = false;
  }
}

export const POST = (...args: Parameters<typeof post>) =>
  withMediaWrite(() => post(...args));
