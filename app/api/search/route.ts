import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { normalizeSearchTokens, sortTags } from "@/lib/tags";

export const revalidate = 30;

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

  const tokens = normalizeSearchTokens(q);
  const where = tokens.length
    ? {
        status: "PUBLISHED" as const,
        AND: tokens.map((token) => ({
          OR: [
            { title: { contains: token } },
            { tags: { some: { tag: { name: { contains: token } } } } },
          ],
        })),
      }
    : {
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

  return NextResponse.json({ items: normalized, page, limit, total, q });
}
