import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { successResponse } from "@/lib/api";
import { sortTags } from "@/lib/tags";

export const revalidate = 30;

function parseIntParam(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = parseIntParam(searchParams.get("page"), 1);
  const limit = parseIntParam(searchParams.get("limit"), 40);
  const skip = (page - 1) * limit;

  const where = {
    status: "PUBLISHED" as const,
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
        copies: true,
        isFeatured: true,
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
    tags: sortTags(item.tags.map((t) => t.tag.name)),
  }));

  return successResponse(
    { items: normalized, page, limit, total },
    "查询成功"
  );
}
