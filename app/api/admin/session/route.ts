import { getCookieValue } from "@/lib/adminAuth";
import { successResponse } from "@/lib/api";
import {
  getAdminSessionCookieName,
  isAdminSessionValid,
} from "@/lib/adminSession";

export async function GET(request: Request) {
  const token = getCookieValue(request, getAdminSessionCookieName());
  const authed = await isAdminSessionValid(token);
  return successResponse({ authed }, "查询成功");
}
