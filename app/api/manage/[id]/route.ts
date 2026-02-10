import path from "node:path";
import { unlink } from "node:fs/promises";

import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

type Payload = {
  title?: string;
  tags?: string[];
  status?: "PUBLISHED" | "HIDDEN";
  action?: "delete";
};

const normalizeTags = (tags: string[]) =>
  Array.from(
    new Set(
      tags
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0)
        .map((tag) => tag.slice(0, 50))
    )
  );

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

const removeFiles = async (urls: string[]) => {
  const paths = new Set<string>();
  urls.forEach((url) => {
    const resolved = resolveDeletePath(url);
    if (resolved) paths.add(resolved);
  });
  for (const filePath of paths) {
    try {
      await unlink(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
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

  if (body.action === "delete") {
    const current = await prisma.meme.findUnique({
      where: { id },
      select: {
        mediaUrl: true,
        thumbUrl: true,
      },
    });

    if (current) {
      await removeFiles([current.mediaUrl, current.thumbUrl]);
    }

    await prisma.$transaction([
      prisma.memeTag.deleteMany({ where: { memeId: id } }),
      prisma.meme.delete({ where: { id } }),
    ]);

    return NextResponse.json({ ok: true });
  }

  const updated = await prisma.meme.update({
    where: { id },
    data: {
      ...(body.title !== undefined ? { title } : {}),
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
