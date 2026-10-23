import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/api";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await Promise.resolve(context.params);

  if (!id) {
    return errorResponse("请求参数不完整", 400, "MISSING_ID");
  }

  const day = new Date().toISOString().slice(0, 10);
  try {
    const [updated] = await prisma.$transaction([
      prisma.meme.update({
        where: { id, status: "PUBLISHED" },
        data: { downloads: { increment: 1 } },
        select: {
          id: true,
          copies: true,
          downloads: true,
        },
      }),
      prisma.memeDailyStat.upsert({
        where: { day_memeId: { day, memeId: id } },
        create: { day, memeId: id, copies: 0, downloads: 1 },
        update: { downloads: { increment: 1 } },
      }),
    ]);

    return successResponse({ item: updated }, "已记录下载");
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return errorResponse("资源不存在", 404, "NOT_FOUND");
    }
    throw error;
  }
}
