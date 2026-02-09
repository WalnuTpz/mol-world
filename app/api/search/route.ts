import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

function parseIntParam(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  const page = parseIntParam(searchParams.get("page"), 1);
  const limit = parseIntParam(searchParams.get("limit"), 40);
  const skip = (page - 1) * limit;

  if (!q) {
    return NextResponse.json({ items: [], page, limit, total: 0, q });
  }

  const where = {
    status: "PUBLISHED" as const,
    title: {
      contains: q,
    },
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
        downloads: true,
        isFeatured: true,
        createdAt: true,
      },
    }),
    prisma.meme.count({ where }),
  ]);

  return NextResponse.json({ items, page, limit, total, q });
}
