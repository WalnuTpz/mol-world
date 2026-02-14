import { successResponse } from "@/lib/api";
import { buildAdminClearCookie } from "@/lib/adminSession";

export async function GET() {
  return successResponse({}, "已退出", 200, {
    "Set-Cookie": buildAdminClearCookie(),
  });
}

export async function POST() {
  return successResponse({}, "已退出", 200, {
    "Set-Cookie": buildAdminClearCookie(),
  });
}
