import { errorResponse } from "@/lib/api";
import {
  getAdminSessionCookieName,
  isAdminSessionValid,
} from "@/lib/adminSession";

export const getCookieValue = (request: Request, name: string) => {
  const part = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${name}=`));
  if (!part) return null;
  try {
    return decodeURIComponent(part.slice(name.length + 1));
  } catch {
    return null;
  }
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
