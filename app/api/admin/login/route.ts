import { errorResponse, successResponse } from "@/lib/api";
import {
  buildAdminSessionCookie,
  buildAdminSessionToken,
  verifyAdminPassword,
} from "@/lib/adminSession";
import { getAppConfig } from "@/lib/appConfig";

type AttemptState = {
  count: number;
  cooldownUntil: number;
};

const attempts = new Map<string, AttemptState>();

const getClientId = (request: Request) => {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip");
  return ip ?? "unknown";
};

const formatRemaining = (ms: number) => {
  const hours = Math.max(1, Math.ceil(ms / (60 * 60 * 1000)));
  return `${hours}小时`;
};

const buildCooldownError = (remainingMs: number) =>
  errorResponse(
    `多次输入错误，请在 ${formatRemaining(remainingMs)} 后再试`,
    429,
    "LOGIN_COOLDOWN",
    { "Retry-After": String(Math.ceil(remainingMs / 1000)) }
  );

export async function POST(request: Request) {
  const config = await getAppConfig();
  const cooldownMs = config.loginCooldownHours * 60 * 60 * 1000;
  const clientId = getClientId(request);
  const now = Date.now();
  const current = attempts.get(clientId);
  if (current && current.cooldownUntil > now) {
    return buildCooldownError(current.cooldownUntil - now);
  }

  const body = (await request.json().catch(() => null)) as
    | { user?: string; pass?: string }
    | null;

  const user = body?.user?.trim() ?? "";
  const pass = body?.pass ?? "";
  if (!user || !pass) {
    return errorResponse("请输入账号和密码", 400, "MISSING_CREDENTIALS");
  }
  const result = await verifyAdminPassword(user, pass);
  if (!result.ok) {
    const nextState: AttemptState = current
      ? { ...current }
      : { count: 0, cooldownUntil: 0 };
    if (nextState.cooldownUntil && nextState.cooldownUntil <= now) {
      nextState.cooldownUntil = 0;
    }
    nextState.count += 1;
    if (nextState.count >= 3) {
      nextState.cooldownUntil = now + cooldownMs;
      nextState.count = 0;
    }
    attempts.set(clientId, nextState);
    if (nextState.cooldownUntil > now) {
      return buildCooldownError(nextState.cooldownUntil - now);
    }
    return errorResponse(result.error || "账号或密码错误", 401, "INVALID_CREDENTIALS");
  }

  attempts.delete(clientId);
  const maxAge = 60 * 60 * 24 * config.adminSessionDays;
  const cookie = buildAdminSessionCookie(
    buildAdminSessionToken(result.credential.user, result.credential.passHash),
    maxAge
  );
  return successResponse({}, "登录成功", 200, { "Set-Cookie": cookie });
}
