import { successResponse } from "@/lib/api";
import { getAdminSessionCookieName, isAdminSessionValid } from "@/lib/adminSession";

const getCookieValue = (request: Request, name: string) => {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
};

export async function GET(request: Request) {
  const token = getCookieValue(request, getAdminSessionCookieName());
  const authed = await isAdminSessionValid(token);
  return successResponse({ authed }, "查询成功");
}
