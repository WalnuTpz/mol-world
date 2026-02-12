import { successResponse } from "@/lib/api";
import { getAdminSessionCookieName } from "@/lib/adminSession";

const clearCookieHeader = () =>
  `${getAdminSessionCookieName()}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;

export async function GET() {
  return successResponse({}, "已退出", 200, {
    "Set-Cookie": clearCookieHeader(),
  });
}

export async function POST() {
  return successResponse({}, "已退出", 200, {
    "Set-Cookie": clearCookieHeader(),
  });
}
