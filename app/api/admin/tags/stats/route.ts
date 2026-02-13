import { prisma } from "@/lib/db";
import { successResponse } from "@/lib/api";
import { requireAdmin } from "@/lib/adminAuth";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  const [totalTags, totalLinks] = await Promise.all([
    prisma.tag.count(),
    prisma.memeTag.count(),
  ]);

  return successResponse(
    { totalTags, totalLinks },
    "统计完成"
  );
}
