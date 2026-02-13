import { prisma } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/api";
import { requireAdmin } from "@/lib/adminAuth";
import { logAudit } from "@/lib/audit";

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  try {
    const result = await prisma.meme.updateMany({
      data: { copies: 0, downloads: 0 },
    });
    void logAudit({
      action: "manage:reset-heat",
      status: "success",
      message: "全站热度清零",
      data: { count: result.count },
      request,
    });
    return successResponse({ count: result.count }, "清零成功");
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
