import {
  VISITOR_COOKIE,
  visitorHash,
  createVisitor,
  visitorCookie,
  tokenDigest,
} from "@/lib/visitors";
import { clientKey, consumeRateLimits, RateLimitError } from "@/lib/rateLimit";
import {
  isAdminSessionValid,
  getAdminSessionCookieName,
} from "@/lib/adminSession";
import { NextResponse, type NextRequest } from "next/server";

const unauthorizedJson = () =>
  NextResponse.json(
    { ok: false, error: "未登录", code: "UNAUTHORIZED" },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const origin = request.headers.get("origin");
  let sameHost = true;
  if (origin) {
    try {
      sameHost =
        new URL(origin).host ===
        (request.headers.get("host") ?? request.nextUrl.host);
    } catch {
      sameHost = false;
    }
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && !sameHost) {
    return NextResponse.json(
      { ok: false, error: "请求来源不合法", code: "INVALID_ORIGIN" },
      { status: 403 },
    );
  }
  const authed = await isAdminSessionValid(
    request.cookies.get(getAdminSessionCookieName())?.value,
  );
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
    try {
      await consumeRateLimits([
        { key: `api:${clientKey(request)}`, maximum: 120, windowMs: 60_000 },
      ]);
    } catch (error) {
      if (!(error instanceof RateLimitError)) throw error;
      return NextResponse.json(
        { ok: false, error: error.message, code: "RATE_LIMIT" },
        {
          status: 429,
          headers: {
            "Retry-After": String(error.retryAfter),
            "Cache-Control": "no-store",
          },
        },
      );
    }
  }

  const headers = new Headers(request.headers);
  headers.delete("x-molworld-visitor");
  let newVisitor: string | null = null;
  const prefetch =
    request.headers.has("next-router-prefetch") ||
    request.headers.has("next-router-segment-prefetch") ||
    request.headers.get("purpose") === "prefetch" ||
    request.headers.get("sec-purpose")?.includes("prefetch");
  if (pathname === "/" && request.method === "GET" && !prefetch) {
    let hash = await visitorHash(request);
    if (!hash) {
      newVisitor = await createVisitor();
      hash = tokenDigest(newVisitor);
      const cookies = (headers.get("cookie") ?? "")
        .split(";")
        .map((value) => value.trim())
        .filter((value) => value && !value.startsWith(`${VISITOR_COOKIE}=`));
      headers.set(
        "cookie",
        [...cookies, `${VISITOR_COOKIE}=${newVisitor}`].join("; "),
      );
    }
    headers.set("x-molworld-visitor", hash);
  }
  const response = NextResponse.next({ request: { headers } });
  if (newVisitor)
    response.headers.append("Set-Cookie", visitorCookie(newVisitor));
  return response;
}

export default proxy;

export const config = {
  matcher: [
    "/",
    "/api/review/:path*",
    "/api/manage/:path*",
    "/api/admin/:path*",
    "/api/:path*",
  ],
};
