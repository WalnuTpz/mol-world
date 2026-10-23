import { updateNameOrder } from "@/lib/nameOrder";
import { clientKey, consumeLimits, RateLimitError } from "@/lib/rateLimit";
import { getCookieValue } from "@/lib/adminAuth";
import sharp, { type Metadata } from "sharp";
import { withMediaWrite, withMediaMutation, mediaPath } from "@/lib/mediaFiles";
import { writeFile } from "node:fs/promises";

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

const isAdminAuthed = async (request: Request) => {
  const token = getCookieValue(request, getAdminSessionCookieName());
  return isAdminSessionValid(token);
};

export async function POST(request: Request) {
  const config = await getAppConfig();
  const tagRules = getTagRulesFromConfig(config);
  const maxSize = config.uploadMaxSizeMb * 1024 * 1024;
  const uploadCooldownMs = config.uploadCooldownSeconds * 1000;
  const globalCooldownMs = config.uploadGlobalCooldownSeconds * 1000;
  const reviewQueueLimit = config.reviewQueueLimit;
  let formData: FormData;
  try {
    const reader = request.body?.getReader();
    if (!reader) return errorResponse("缺少上传数据", 400, "INVALID_BODY");
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxSize + 64 * 1024) {
        await reader.cancel();
        return errorResponse("文件超过大小限制", 413, "FILE_TOO_LARGE");
      }
      chunks.push(value);
    }
    formData = await new Response(Buffer.concat(chunks), {
      headers: request.headers,
    }).formData();
  } catch {
    return errorResponse("上传数据格式错误", 400, "INVALID_BODY");
  }
  const file = formData.get("file");
  const rawTitle = formData.get("title");
  const rawTags = formData.get("tags");

  if (!(file instanceof File)) {
    await logAudit({
      action: "upload",
      status: "error",
      message: "缺少文件",
      request,
    });
    return errorResponse("缺少文件", 400, "MISSING_FILE");
  }

  if (file.size > maxSize) {
    await logAudit({
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
    await logAudit({
      action: "upload",
      status: "error",
      message: "文件格式不支持",
      data: { type: file.type },
      request,
    });
    return errorResponse("文件格式不支持", 400, "UNSUPPORTED_FILE_TYPE");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let metadata: Metadata;
  try {
    const decoded = sharp(buffer, {
      animated: true,
      limitInputPixels: 40_000_000,
    });
    metadata = await decoded.metadata();
    await decoded.stats();
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

  return withMediaWrite(async () => {
    if (title) {
      const existing = await prisma.meme.findFirst({
        where: { title },
        select: { id: true },
      });
      if (existing) {
        await logAudit({
          action: "upload",
          status: "error",
          message: "上传失败（已存在该表情包）",
          data: { title },
          request,
        });
        return errorResponse(
          "上传失败（已存在该表情包）",
          409,
          "DUPLICATE_MEME",
        );
      }
    }

    const pendingCount = await prisma.meme.count({
      where: {
        status: { in: ["PENDING", "HIDDEN"] as const },
        mediaUrl: { startsWith: "/uploads/" },
      },
    });
    if (pendingCount >= reviewQueueLimit) {
      await logAudit({
        action: "upload",
        status: "error",
        message: "上传失败（目前审核队列已过载）",
        data: { pendingCount },
        request,
      });
      return errorResponse("上传失败（目前审核队列已过载）", 409, "QUEUE_FULL");
    }

    const isAdmin = await isAdminAuthed(request);
    try {
      const filename = `${crypto.randomUUID()}${ext}`;
      const mediaUrl = `/uploads/${filename}`;
      const type =
        ext === ".gif" || (metadata.pages ?? 1) > 1 ? "ANIMATED" : "STATIC";

      const created = await withMediaMutation(
        [mediaUrl],
        [],
        () => writeFile(mediaPath(mediaUrl), buffer, { flag: "wx" }),
        async (tx) => {
          if (!isAdmin)
            await consumeLimits(tx, [
              { key: "upload:global", maximum: 1, windowMs: globalCooldownMs },
              {
                key: `upload:${clientKey(request)}`,
                maximum: 1,
                windowMs: uploadCooldownMs,
              },
            ]);
          const numId = await getNextMemeNumId(tx);
          const tagRows = await ensureTagsWithNumId(tx, tags);
          const item = await tx.meme.create({
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
          await updateNameOrder(tx, item.id);
          return item;
        },
      );

      await logAudit({
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
      if (error instanceof RateLimitError)
        return errorResponse(error.message, 429, "UPLOAD_RATE_LIMIT", {
          "Retry-After": String(error.retryAfter),
        });
      console.error("Upload failed", error);
      return errorResponse("上传失败，请重试", 500, "UPLOAD_FAILED");
    }
  });
}
