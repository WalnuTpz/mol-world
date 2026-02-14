import { prisma } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/api";
import { requireAdmin } from "@/lib/adminAuth";
import { logAudit } from "@/lib/audit";

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  try {
    const [memeResult, statResult] = await prisma.$transaction([
      prisma.meme.updateMany({
        data: { copies: 0, downloads: 0 },
      }),
      prisma.memeDailyStat.updateMany({
        data: { copies: 0, downloads: 0 },
      }),
    ]);
    void logAudit({
      action: "manage:reset-heat",
      status: "success",
      message: "全站热度清零",
      data: { memes: memeResult.count, stats: statResult.count },
      request,
    });
    return successResponse(
      { count: memeResult.count, stats: statResult.count },
      "清零成功"
    );
  } catch (error) {
    void logAudit({
      action: "manage:reset-heat",
      status: "error",
      message: "全站热度清零失败",
      request,
    });
    const message = error instanceof Error ? error.message : "清零失败";
    return errorResponse(message, 500);
  }
}
