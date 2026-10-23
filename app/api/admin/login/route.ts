import {
  clientKey,
  consumeRateLimits,
  clearRateLimit,
  RateLimitError,
} from "@/lib/rateLimit";
import { errorResponse, successResponse } from "@/lib/api";
import {
  buildAdminSessionCookie,
  createAdminSession,
  verifyAdminPassword,
  StaleCredentialError,
} from "@/lib/adminSession";
import { getAppConfig } from "@/lib/appConfig";

export async function POST(request: Request) {
  const config = await getAppConfig();
  const cooldownMs = config.loginCooldownHours * 60 * 60 * 1000;
  const body = (await request.json().catch(() => null)) as {
    user?: string;
    pass?: string;
  } | null;

  if (typeof body?.user !== "string" || typeof body?.pass !== "string")
    return errorResponse("请求参数格式错误", 400, "INVALID_BODY");
  const user = body?.user?.trim() ?? "";
  const pass = body?.pass ?? "";
  if (!user || !pass) {
    return errorResponse("请输入账号和密码", 400, "MISSING_CREDENTIALS");
  }
  const key = `login:${clientKey(request)}`;
  let attempts;
  try {
    [attempts] = await consumeRateLimits([
      { key, maximum: 3, windowMs: cooldownMs },
    ]);
  } catch (error) {
    if (!(error instanceof RateLimitError)) throw error;
    return errorResponse("多次输入错误，请稍后再试", 429, "LOGIN_COOLDOWN", {
      "Retry-After": String(error.retryAfter),
    });
  }
  const result = await verifyAdminPassword(user, pass);
  if (!result.ok) {
    if (attempts?.remaining === 0)
      return errorResponse("多次输入错误，请稍后再试", 429, "LOGIN_COOLDOWN", {
        "Retry-After": String(
          Math.max(
            1,
            Math.ceil((attempts.resetAt.getTime() - Date.now()) / 1000),
          ),
        ),
      });
    return errorResponse(result.error, 401, "INVALID_CREDENTIALS");
  }
  await clearRateLimit(key);
  const maxAge = 60 * 60 * 24 * config.adminSessionDays;
  try {
    const cookie = buildAdminSessionCookie(
      await createAdminSession(result.credential, maxAge),
      maxAge,
    );
    return successResponse({}, "登录成功", 200, { "Set-Cookie": cookie });
  } catch (error) {
    if (error instanceof StaleCredentialError)
      return errorResponse(
        "凭据已变更，请重新登录",
        401,
        "INVALID_CREDENTIALS",
      );
    throw error;
  }
}
