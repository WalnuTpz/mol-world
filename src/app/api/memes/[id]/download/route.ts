import path from "node:path";
import { prisma } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/api";
import {
  prepareInteraction,
  validateInteraction,
  completeInteraction,
  InteractionError,
} from "@/lib/interactions";
import { RateLimitError } from "@/lib/rateLimit";
import { mediaResponse } from "@/lib/mediaResponse";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    const prepared = await prepareInteraction(request, id, "download");
    return successResponse(
      {
        url: `/api/memes/${encodeURIComponent(id)}/download?token=${prepared.token}`,
      },
      "可以下载",
    );
  } catch (error) {
    if (error instanceof InteractionError)
      return errorResponse(error.message, error.status, "INVALID_INTERACTION");
    if (error instanceof RateLimitError)
      return errorResponse(error.message, 429, "RATE_LIMIT", {
        "Retry-After": String(error.retryAfter),
      });
    throw error;
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const token = new URL(request.url).searchParams.get("token");
  try {
    await validateInteraction(request, id, "download", token);
    const meme = await prisma.meme.findUnique({
      where: { id, status: "PUBLISHED" },
      select: { mediaUrl: true },
    });
    if (!meme) throw new InteractionError("资源不存在", 404);
    const headers = new Headers(request.headers);
    headers.delete("if-none-match");
    headers.delete("if-modified-since");
    const file = path.posix.basename(meme.mediaUrl);
    const source = await mediaResponse(
      new Request(request.url, { headers }),
      "original",
      file,
    );
    if (!source.ok || !source.body) return source;
    const reader = source.body.getReader();
    let canceled = false;
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const result = await reader.read();
          if (canceled) return;
          if (result.done) {
            await completeInteraction(request, id, "download", token);
            if (!canceled) controller.close();
          } else controller.enqueue(result.value);
        } catch (error) {
          if (!canceled) controller.error(error);
          await reader.cancel(error);
        }
      },
      cancel(reason) {
        canceled = true;
        return reader.cancel(reason);
      },
    });
    const responseHeaders = new Headers(source.headers);
    responseHeaders.delete("Content-Length");
    responseHeaders.set("Cache-Control", "private, no-store");
    responseHeaders.set(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(file)}`,
    );
    return new Response(body, { headers: responseHeaders });
  } catch (error) {
    if (error instanceof InteractionError)
      return errorResponse(error.message, error.status, "INVALID_INTERACTION");
    throw error;
  }
}
