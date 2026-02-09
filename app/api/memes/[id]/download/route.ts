import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

export async function POST(
  _request: Request,
  context: { params: { id: string } }
) {
  const { id } = context.params;

  if (!id) {
    return NextResponse.json(
      { error: "Missing meme id" },
      { status: 400 }
    );
  }

  const updated = await prisma.meme.update({
    where: { id },
    data: { downloads: { increment: 1 } },
    select: {
      id: true,
      downloads: true,
    },
  });

  return NextResponse.json({ item: updated });
}
