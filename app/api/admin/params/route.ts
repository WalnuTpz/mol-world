import { errorResponse, successResponse } from "@/lib/api";
import { getAppConfig, updateAppConfig } from "@/lib/appConfig";
import { requireAdmin } from "@/lib/adminAuth";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  const config = await getAppConfig();
  return successResponse({ config }, "查询成功");
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => null)) as
    | Record<string, unknown>
    | { updates?: Record<string, unknown> }
    | null;

  if (!body) {
    return errorResponse("请求参数不完整", 400, "MISSING_PARAMS");
  }

  const updates =
    "updates" in body && body.updates && typeof body.updates === "object"
      ? (body.updates as Record<string, unknown>)
      : (body as Record<string, unknown>);

  const result = await updateAppConfig(updates);
  if (!result.ok) {
    return errorResponse(result.error, 400, "INVALID_CONFIG");
  }

  return successResponse({ config: result.config }, "已保存");
}
