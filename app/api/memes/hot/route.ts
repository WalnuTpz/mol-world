import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { sortTags } from "@/lib/tags";

function parseIntParam(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function shuffle<T>(items: T[]) {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode") ?? "latest";
  const limit = parseIntParam(searchParams.get("limit"), 30);

  const baseWhere = {
    isFeatured: true,
    status: "PUBLISHED" as const,
  };

  if (mode === "random") {
    const all = await prisma.meme.findMany({
      where: baseWhere,
      select: {
        id: true,
        title: true,
        type: true,
        mediaUrl: true,
        thumbUrl: true,
        copies: true,
        isFeatured: true,
        createdAt: true,
        tags: {
          select: {
            tag: { select: { name: true } },
          },
        },
      },
    });
    const items = shuffle(all)
      .slice(0, limit)
      .map((item) => ({
        ...item,
        tags: sortTags(item.tags.map((t) => t.tag.name)),
      }));
    return NextResponse.json({ items, mode, limit });
  }

  const orderBy =
    mode === "hot"
      ? { copies: "desc" as const }
      : { createdAt: "desc" as const };

  const items = await prisma.meme.findMany({
    where: baseWhere,
    orderBy,
    take: limit,
    select: {
      id: true,
      title: true,
      type: true,
      mediaUrl: true,
      thumbUrl: true,
      copies: true,
      isFeatured: true,
      createdAt: true,
      tags: {
        select: {
          tag: { select: { name: true } },
        },
      },
    },
  });

  const normalized = items.map((item) => ({
    ...item,
    tags: sortTags(item.tags.map((t) => t.tag.name)),
  }));

  return NextResponse.json({ items: normalized, mode, limit });
}
