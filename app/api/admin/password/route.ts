import { errorResponse, successResponse } from "@/lib/api";
import {
  buildAdminSessionToken,
  getAdminCredential,
  getAdminSessionCookieName,
  isAdminSessionValid,
  updateAdminPassword,
  verifyAdminPassword,
} from "@/lib/adminSession";
import { getAppConfig } from "@/lib/appConfig";
import { logAudit } from "@/lib/audit";

const getCookieValue = (request: Request, name: string) => {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
};

export async function POST(request: Request) {
  const token = getCookieValue(request, getAdminSessionCookieName());
  const authed = await isAdminSessionValid(token);
  if (!authed) {
    return errorResponse("未登录管理员账号", 401, "UNAUTHORIZED");
  }

  const body = (await request.json().catch(() => null)) as
    | { currentPass?: string; newPass?: string; confirmPass?: string }
    | null;
  const currentPass = body?.currentPass?.trim() ?? "";
  const newPass = body?.newPass ?? "";
  const confirmPass = body?.confirmPass ?? "";

  if (!currentPass || !newPass || !confirmPass) {
    return errorResponse("请填写完整信息", 400, "MISSING_FIELDS");
  }
  if (newPass !== confirmPass) {
    return errorResponse("两次输入的新密码不一致", 400, "PASSWORD_MISMATCH");
  }

  const credential = await getAdminCredential();
  if (!credential) {
    return errorResponse("管理员账号未配置", 400, "NO_ADMIN");
  }

  const verify = await verifyAdminPassword(credential.user, currentPass);
  if (!verify.ok) {
    void logAudit({
      action: "admin_change_password",
      status: "error",
      message: verify.error || "原密码错误",
      request,
    });
    return errorResponse(verify.error || "原密码错误", 401, "INVALID_CREDENTIALS");
  }

  const result = await updateAdminPassword(credential.user, newPass);
  if (!result.ok) {
    void logAudit({
      action: "admin_change_password",
      status: "error",
      message: result.error,
      request,
    });
    return errorResponse(result.error || "修改失败", 500, "UPDATE_FAILED");
  }

  const config = await getAppConfig();
  const maxAge = 60 * 60 * 24 * config.adminSessionDays;
  const cookie = `${getAdminSessionCookieName()}=${buildAdminSessionToken(
    result.credential.user,
    result.credential.passHash
  )}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax`;

  void logAudit({
    action: "admin_change_password",
    status: "success",
    message: "已修改密码",
    request,
  });

  return successResponse({}, "修改成功", 200, {
    "Set-Cookie": cookie,
  });
}
