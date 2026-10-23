import { getCookieValue } from "@/lib/adminAuth";
import { errorResponse, successResponse } from "@/lib/api";
import {
  buildAdminSessionCookie,
  getAdminSessionCookieName,
  isAdminSessionValid,
  updateAdminPassword,
} from "@/lib/adminSession";
import { getAppConfig } from "@/lib/appConfig";
import { logAudit } from "@/lib/audit";

export async function POST(request: Request) {
  const token = getCookieValue(request, getAdminSessionCookieName());
  const authed = await isAdminSessionValid(token);
  if (!authed) {
    return errorResponse("未登录管理员账号", 401, "UNAUTHORIZED");
  }

  const body = (await request.json().catch(() => null)) as {
    newPass?: string;
    confirmPass?: string;
  } | null;
  const allowedKeys = new Set(["newPass", "confirmPass"]);
  const extraKeys = Object.keys(body ?? {}).filter(
    (key) => !allowedKeys.has(key),
  );
  if (extraKeys.length > 0) {
    return errorResponse("请求参数不合法", 400, "INVALID_FIELDS");
  }
  if (
    typeof body?.newPass !== "string" ||
    typeof body?.confirmPass !== "string"
  )
    return errorResponse("请求参数格式错误", 400, "INVALID_BODY");
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

  const config = await getAppConfig();
  const maxAge = 60 * 60 * 24 * config.adminSessionDays;
  const result = await updateAdminPassword(token, newPass, maxAge);
  if (!result.ok)
    return errorResponse("会话已失效，请重新登录", 401, "UNAUTHORIZED");
  const cookie = buildAdminSessionCookie(result.token, maxAge);

  await logAudit({
    action: "admin_change_password",
    status: "success",
    message: "已修改密码",
    request,
  });

  return successResponse({}, "修改成功", 200, {
    "Set-Cookie": cookie,
  });
}
