import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

function parseIntParam(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = parseIntParam(searchParams.get("page"), 1);
  const limit = parseIntParam(searchParams.get("limit"), 40);
  const q = (searchParams.get("q") ?? "").trim();
  const skip = (page - 1) * limit;

  const tokens = q
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  const where = {
    status: { in: ["PUBLISHED", "HIDDEN"] as const },
    ...(tokens.length
      ? {
          AND: tokens.map((token) => ({
            OR: [
              { title: { contains: token } },
              { tags: { some: { tag: { name: { contains: token } } } } },
            ],
          })),
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.meme.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
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
    }),
    prisma.meme.count({ where }),
  ]);

  const normalized = items.map((item) => ({
    ...item,
    tags: item.tags.map((t) => t.tag.name),
  }));

  return NextResponse.json({ items: normalized, page, limit, total, q });
}
