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

export function middleware(request: NextRequest) {
  const user = process.env.REVIEW_USER;
  const pass = process.env.REVIEW_PASS;

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

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/review/:path*",
    "/api/review/:path*",
    "/manage/:path*",
    "/api/manage/:path*",
  ],
};
