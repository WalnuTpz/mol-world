import { errorResponse } from "@/lib/api";
import { getAdminSessionCookieName, isAdminSessionValid } from "@/lib/adminSession";

const getCookieValue = (request: Request, name: string) => {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
};

export const requireAdmin = async (request: Request) => {
  const token = getCookieValue(request, getAdminSessionCookieName());
  const authed = await isAdminSessionValid(token);
  if (!authed) {
    return {
      ok: false as const,
      response: errorResponse("未登录", 401, "UNAUTHORIZED"),
    };
  }
  return { ok: true as const };
};
