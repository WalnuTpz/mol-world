import { errorResponse, successResponse } from "@/lib/api";
import {
  prepareInteraction,
  completeInteraction,
  InteractionError,
} from "@/lib/interactions";
import { RateLimitError } from "@/lib/rateLimit";
import { publicMediaUrl } from "@/lib/mediaUrl";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  try {
    if (body?.action === "prepare") {
      const prepared = await prepareInteraction(request, id, "copy");
      return successResponse(
        {
          token: prepared.token,
          item: {
            ...prepared.item,
            mediaUrl: publicMediaUrl(prepared.item.mediaUrl),
            thumbUrl: publicMediaUrl(prepared.item.thumbUrl),
          },
        },
        "可以复制",
      );
    }
    const item = await completeInteraction(request, id, "copy", body?.token);
    return successResponse({ item }, "已记录复制");
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
