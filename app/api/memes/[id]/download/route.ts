import { prisma } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/api";

export async function POST(
  _request: Request,
  context: { params: { id: string } | Promise<{ id: string }> }
) {
  const { id } = await Promise.resolve(context.params);

  if (!id) {
    return errorResponse("请求参数不完整", 400, "MISSING_ID");
  }

  const updated = await prisma.meme.update({
    where: { id },
    data: { copies: { increment: 1 } },
    select: {
      id: true,
      copies: true,
    },
  });

  return successResponse({ item: updated }, "已记录复制");
}
