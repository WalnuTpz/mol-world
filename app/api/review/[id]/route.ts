import path from "node:path";
import { copyFile, mkdir, rename, unlink } from "node:fs/promises";

import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

type Payload = {
  title?: string;
  tags?: string[];
  status?: "PUBLISHED" | "HIDDEN" | "DELETED";
};

export const runtime = "nodejs";

const normalizeTags = (tags: string[]) =>
  Array.from(
    new Set(
      tags
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0)
        .map((tag) => tag.slice(0, 50))
    )
  );

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

const moveToLibrary = async (id: string, mediaUrl: string) => {
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

  return {
    mediaUrl: `/memes/original/${targetName}`,
    thumbUrl: `/memes/original/${targetName}`,
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
    return NextResponse.json({ error: "Missing meme id" }, { status: 400 });
  }

  const body = (await request.json()) as Payload;
  const title = body.title?.trim() ?? null;
  const status = body.status;
  const tags = body.tags ? normalizeTags(body.tags) : [];

  const current = await prisma.meme.findUnique({
    where: { id },
    select: {
      id: true,
      mediaUrl: true,
    },
  });

  const moved =
    status === "PUBLISHED" && current
      ? await moveToLibrary(current.id, current.mediaUrl)
      : null;

  if (status === "DELETED" && current) {
    await removeFromUploads(current.mediaUrl);
  }

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

  return NextResponse.json({
    item: {
      ...updated,
      tags: updated.tags.map((t) => t.tag.name),
    },
  });
}
