import { mediaResponse } from "@/lib/mediaResponse";

export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ file: string }> },
) {
  const { file } = await context.params;
  return mediaResponse(request, "uploads", file);
}
export const HEAD = GET;
