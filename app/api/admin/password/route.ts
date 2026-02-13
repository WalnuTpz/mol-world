import { errorResponse, successResponse } from "@/lib/api";
import {
  buildAdminSessionToken,
  getAdminCredential,
  getAdminSessionCookieName,
  isAdminSessionValid,
  updateAdminPassword,
} from "@/lib/adminSession";
import { getAppConfig } from "@/lib/appConfig";
import { logAudit } from "@/lib/audit";

const getCookieValue = (request: Request, name: string) => {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
};

export async function GET(request: Request) {
  const auth = await isAdminSessionValid(
    getCookieValue(request, getAdminSessionCookieName())
  );
  if (!auth) {
    return errorResponse("未登录", 401, "UNAUTHORIZED");
  }

  const credential = await getAdminCredential();
  if (!credential) {
    return errorResponse("管理员账号未配置", 400, "NO_ADMIN");
  }
  if (!credential.passPlain) {
    return errorResponse("密码未保存，请先修改一次密码", 400, "NO_PASSWORD");
  }

  return successResponse(
    { user: credential.user, pass: credential.passPlain },
    "查询成功"
  );
}

export async function POST(request: Request) {
  const token = getCookieValue(request, getAdminSessionCookieName());
  const authed = await isAdminSessionValid(token);
  if (!authed) {
    return errorResponse("未登录管理员账号", 401, "UNAUTHORIZED");
  }

  const body = (await request.json().catch(() => null)) as
    | { newPass?: string; confirmPass?: string }
    | null;
  const allowedKeys = new Set(["newPass", "confirmPass"]);
  const extraKeys = Object.keys(body ?? {}).filter((key) => !allowedKeys.has(key));
  if (extraKeys.length > 0) {
    return errorResponse("请求参数不合法", 400, "INVALID_FIELDS");
  }
  const newPass = body?.newPass ?? "";
  const confirmPass = body?.confirmPass ?? "";

  if (!newPass || !confirmPass) {
    return errorResponse("请填写完整信息", 400, "MISSING_FIELDS");
  }
  if (newPass.length < 4 || newPass.length > 64) {
    return errorResponse("密码长度需在 4-64 位之间", 400, "INVALID_PASSWORD");
  }
  if (newPass !== confirmPass) {
    return errorResponse("两次输入的新密码不一致", 400, "PASSWORD_MISMATCH");
  }

  const credential = await getAdminCredential();
  if (!credential) {
    return errorResponse("管理员账号未配置", 400, "NO_ADMIN");
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
