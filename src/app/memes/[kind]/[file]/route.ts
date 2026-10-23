import { mediaResponse } from "@/lib/mediaResponse";

export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ kind: string; file: string }> },
) {
  const { kind, file } = await context.params;
  if (kind !== "original" && kind !== "thumb")
    return new Response(null, { status: 404 });
  return mediaResponse(request, kind, file);
}
export const HEAD = GET;
