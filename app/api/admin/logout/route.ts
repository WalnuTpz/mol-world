import { successResponse } from "@/lib/api";
import { getCookieValue } from "@/lib/adminAuth";
import {
  buildAdminClearCookie,
  getAdminSessionCookieName,
  revokeAdminSession,
} from "@/lib/adminSession";

export async function POST(request: Request) {
  await revokeAdminSession(
    getCookieValue(request, getAdminSessionCookieName()),
  );
  return successResponse({}, "已退出", 200, {
    "Set-Cookie": buildAdminClearCookie(),
  });
}
