import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

export async function POST(
  _request: Request,
  context: { params: { id: string } | Promise<{ id: string }> }
) {
  const { id } = await Promise.resolve(context.params);

  if (!id) {
    return NextResponse.json(
      { error: "Missing meme id" },
      { status: 400 }
    );
  }

  const updated = await prisma.meme.update({
    where: { id },
    data: { copies: { increment: 1 } },
    select: {
      id: true,
      copies: true,
    },
  });

  return NextResponse.json({ item: updated });
}
