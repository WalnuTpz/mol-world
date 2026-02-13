import { NextResponse, type NextRequest } from "next/server";

const unauthorizedJson = () =>
  NextResponse.json({ ok: false, error: "未登录", code: "UNAUTHORIZED" }, { status: 401 });

const API_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const API_RATE_LIMIT_MAX = 120;
const apiRateLimit = new Map<string, { count: number; startedAt: number }>();

const getClientId = (request: NextRequest) => {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip");
  return ip ?? "unknown";
};

const isAdminAuthed = (request: NextRequest) =>
  Boolean(request.cookies.get("admin_session")?.value);

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const authed = isAdminAuthed(request);
  const isAdminApi =
    pathname.startsWith("/api/review") ||
    pathname.startsWith("/api/manage") ||
    pathname.startsWith("/api/admin");
  const isAuthFreeApi =
    pathname.startsWith("/api/admin/login") ||
    pathname.startsWith("/api/admin/logout") ||
    pathname.startsWith("/api/admin/session");

  if (isAdminApi && !isAuthFreeApi && !authed) {
    return unauthorizedJson();
  }

  if (pathname.startsWith("/api/") && !authed) {
    const clientId = getClientId(request);
    const now = Date.now();
    const current = apiRateLimit.get(clientId);
    if (!current || now - current.startedAt >= API_RATE_LIMIT_WINDOW_MS) {
      apiRateLimit.set(clientId, { count: 1, startedAt: now });
    } else {
      current.count += 1;
      if (current.count > API_RATE_LIMIT_MAX) {
        const retryAfter = Math.ceil(
          (API_RATE_LIMIT_WINDOW_MS - (now - current.startedAt)) / 1000
        );
        return NextResponse.json(
          {
            ok: false,
            error: "操作过于频繁，请稍后再试",
            code: "RATE_LIMIT",
          },
          {
            status: 429,
            headers: { "Retry-After": String(Math.max(1, retryAfter)) },
          }
        );
      }
    }
  }

  return NextResponse.next();
}

export default proxy;

export const config = {
  matcher: [
    "/api/review/:path*",
    "/api/manage/:path*",
    "/api/admin/:path*",
    "/api/:path*",
  ],
};
