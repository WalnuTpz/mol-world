import { withTrashedMedia, withMediaWrite } from "@/lib/mediaFiles";
import { prisma } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/api";
import { requireAdmin } from "@/lib/adminAuth";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";

async function post(request: Request) {
  const pending = await prisma.meme.findMany({
    where: {
      status: "PENDING" as const,
      mediaUrl: { startsWith: "/uploads/" },
    },
    select: {
      id: true,
      mediaUrl: true,
      thumbUrl: true,
    },
  });

  if (pending.length === 0) {
    await logAudit({
      action: "review:clear",
      status: "success",
      message: "已清空审核队列",
      data: { count: 0 },
      request,
    });
    return successResponse({ count: 0 }, "已清空审核队列");
  }

  try {
    const ids = pending.map((item) => item.id);
    await withTrashedMedia(
      pending.flatMap((item) => [item.mediaUrl, item.thumbUrl]),
      async (tx) => {
        await tx.memeTag.deleteMany({ where: { memeId: { in: ids } } });
        return tx.meme.deleteMany({ where: { id: { in: ids } } });
      },
    );

    await logAudit({
      action: "review:clear",
      status: "success",
      message: "已清空审核队列",
      data: { count: pending.length },
      request,
    });
    return successResponse({ count: pending.length }, "已清空审核队列");
  } catch (error) {
    console.error(error);
    await logAudit({
      action: "review:clear",
      status: "error",
      message: "清理失败，请重试",
      data: { count: pending.length },
      request,
    });
    return errorResponse("清理失败，请重试", 500, "CLEAR_FAILED");
  }
}

export const POST = async (...args: Parameters<typeof post>) => {
  const auth = await requireAdmin(args[0]);
  if (!auth.ok) return auth.response;
  return withMediaWrite(async () => {
    const current = await requireAdmin(args[0]);
    return current.ok ? post(...args) : current.response;
  });
};
