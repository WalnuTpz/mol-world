import path from "node:path";
import { copyFile, mkdir, rename } from "node:fs/promises";

import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

type Payload = {
  title?: string;
  tags?: string[];
  status?: "PUBLISHED" | "HIDDEN";
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

const toPublicPath = (url: string) =>
  path.join(process.cwd(), "public", url.replace(/^\//, ""));

const createThumb = async (inputPath: string, baseName: string, ext: string) => {
  const thumbDir = path.join(process.cwd(), "public", "memes", "thumb");
  await ensureDir(thumbDir);

  try {
    const mod = await import("sharp");
    const sharp = "default" in mod ? mod.default : mod;
    const outputPath = path.join(thumbDir, `${baseName}.jpg`);
    await sharp(inputPath)
      .resize({ width: 480, height: 480, fit: "inside" })
      .jpeg({ quality: 82 })
      .toFile(outputPath);
    return `/memes/thumb/${baseName}.jpg`;
  } catch {
    const outputPath = path.join(thumbDir, `${baseName}${ext}`);
    await copyFile(inputPath, outputPath);
    return `/memes/thumb/${baseName}${ext}`;
  }
};

const moveToLibrary = async (id: string, mediaUrl: string) => {
  if (!mediaUrl.startsWith("/uploads/")) {
    return null;
  }

  const ext = path.extname(mediaUrl) || ".png";
  const originalDir = path.join(process.cwd(), "public", "memes", "original");
  await ensureDir(originalDir);

  const targetName = `${id}${ext}`;
  const targetPath = path.join(originalDir, targetName);
  const sourcePath = toPublicPath(mediaUrl);

  await rename(sourcePath, targetPath);
  const thumbUrl = await createThumb(targetPath, id, ext);

  return {
    mediaUrl: `/memes/original/${targetName}`,
    thumbUrl,
  };
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
    status && current ? await moveToLibrary(current.id, current.mediaUrl) : null;

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
