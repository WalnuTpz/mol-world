import { prisma } from "@/lib/db";
import { successResponse } from "@/lib/api";

export async function GET() {
  const [totalTags, totalLinks] = await Promise.all([
    prisma.tag.count(),
    prisma.memeTag.count(),
  ]);

  return successResponse(
    { totalTags, totalLinks },
    "统计完成"
  );
}
