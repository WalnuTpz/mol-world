import path from "node:path";
import { copyFile, mkdir, rename, unlink } from "node:fs/promises";

import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/api";
import { generateThumb } from "@/lib/thumbs";
import { normalizeTags, sortTags } from "@/lib/tags";

type Payload = {
  title?: string;
  tags?: string[];
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
  await ensureDir(originalDir);

  const targetName = `${id}${ext}`;
  const targetPath = path.join(originalDir, targetName);

  await rename(source.sourcePath, targetPath);

  const thumbDir = path.join(process.cwd(), "public", "memes", "thumb");
  const thumbName = `${id}.${animated ? "gif" : "jpg"}`;
  const thumbPath = path.join(thumbDir, thumbName);
  await generateThumb(targetPath, thumbPath, animated);

  return {
    mediaUrl: `/memes/original/${targetName}`,
    thumbUrl: `/memes/thumb/${thumbName}`,
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
  const { id } = await Promise.resolve(context.params);
  if (!id) {
    return errorResponse("请求参数不完整", 400, "MISSING_ID");
  }

  const rawBody = await request.text();
  if (!rawBody.trim()) {
    return errorResponse("请求参数不完整", 400, "EMPTY_BODY");
  }
  let body: Payload;
  try {
    body = JSON.parse(rawBody) as Payload;
  } catch {
    return errorResponse("请求参数格式错误", 400, "INVALID_BODY");
  }
  const title = body.title?.trim() ?? null;
  const status = body.status;
  const tags = body.tags ? normalizeTags(body.tags) : [];

  if (body.action === "delete") {
    const current = await prisma.meme.findUnique({
      where: { id },
      select: {
        id: true,
        mediaUrl: true,
        thumbUrl: true,
      },
    });

    if (current) {
      await removeFromUploads(current.mediaUrl);
      await removeFromUploads(current.thumbUrl);
    }

    await prisma.$transaction([
      prisma.memeTag.deleteMany({ where: { memeId: id } }),
      prisma.meme.delete({ where: { id } }),
    ]);

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

  const moved =
    status && current
      ? await moveToLibrary(
          current.id,
          current.mediaUrl,
          current.type === "ANIMATED"
        )
      : null;

  const updated = await prisma.meme.update({
    where: { id },
    data: {
      title,
      ...(moved ? moved : {}),
      ...(status ? { status } : {}),
      ...(body.tags
        ? {
            tags: {
              deleteMany: {},
              create: tags.map((name) => ({
                tag: {
                  connectOrCreate: {
                    where: { name },
                    create: { name },
                  },
                },
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
