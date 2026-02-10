import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

export async function GET() {
  const items = await prisma.meme.findMany({
    where: {
      status: { not: "DELETED" },
    },
    orderBy: { createdAt: "desc" },
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

  const normalized = items.map((item) => ({
    ...item,
    tags: item.tags.map((t) => t.tag.name),
  }));

  return NextResponse.json({ items: normalized });
}
