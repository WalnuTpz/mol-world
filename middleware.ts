import { NextResponse, type NextRequest } from "next/server";

const unauthorized = () =>
  new NextResponse("Unauthorized", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Review"' },
  });

const decodeBasicAuth = (value: string) => {
  try {
    const decoded = atob(value);
    const index = decoded.indexOf(":");
    if (index === -1) return null;
    return {
      user: decoded.slice(0, index),
      pass: decoded.slice(index + 1),
    };
  } catch {
    return null;
  }
};

const API_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const API_RATE_LIMIT_MAX = 120;
const apiRateLimit = new Map<string, { count: number; startedAt: number }>();

const getClientId = (request: NextRequest) => {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip");
  return ip ?? "unknown";
};

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected =
    pathname.startsWith("/review") ||
    pathname.startsWith("/manage") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api/review") ||
    pathname.startsWith("/api/manage");
  const user = process.env.REVIEW_USER;
  const pass = process.env.REVIEW_PASS;

  if (isProtected) {
    if (!user || !pass) {
      return unauthorized();
    }

    const auth = request.headers.get("authorization");
    if (!auth || !auth.startsWith("Basic ")) {
      return unauthorized();
    }

    const parsed = decodeBasicAuth(auth.slice(6));
    if (!parsed || parsed.user !== user || parsed.pass !== pass) {
      return unauthorized();
    }
  }

  if (pathname.startsWith("/api/")) {
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

export const config = {
  matcher: [
    "/review/:path*",
    "/api/review/:path*",
    "/manage/:path*",
    "/api/manage/:path*",
    "/admin/:path*",
    "/api/:path*",
  ],
};
