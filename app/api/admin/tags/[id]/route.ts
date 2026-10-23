import { withDatabaseWrite } from "@/lib/databaseWrite";
import { findTagById } from "@/lib/tagQueries";
import { prisma } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/api";
import { requireAdmin } from "@/lib/adminAuth";
import { normalizeTagInput } from "@/lib/tags";
import { getAppConfig, getTagRulesFromConfig } from "@/lib/appConfig";

type Payload = {
  name?: string;
};

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  const config = await getAppConfig();
  const tagRules = getTagRulesFromConfig(config);
  const { id: rawId } = await Promise.resolve(context.params);
  if (!rawId) {
    return errorResponse("请求参数不完整", 400, "MISSING_ID");
  }

  const body = (await request.json().catch(() => null)) as Payload | null;
  const allowedKeys = new Set(["name"]);
  const extraKeys = Object.keys(body ?? {}).filter(
    (key) => !allowedKeys.has(key),
  );
  if (extraKeys.length > 0) {
    return errorResponse("请求参数不合法", 400, "INVALID_FIELDS");
  }
  if (typeof body?.name !== "string")
    return errorResponse("请求参数格式错误", 400, "INVALID_BODY");
  const rawName = body?.name ?? "";
  const normalized = normalizeTagInput(rawName, tagRules);
  if (normalized.length === 0) {
    return errorResponse("标签不能为空", 400, "INVALID_TAG");
  }
  if (normalized.length > 1) {
    return errorResponse("仅支持单个标签", 400, "MULTI_TAG");
  }

  const nextName = normalized[0];
  return withDatabaseWrite(() =>
    prisma.$transaction(async (tx) => {
      const current = await findTagById(tx, rawId);
      if (!current) {
        return errorResponse("标签不存在", 404, "TAG_NOT_FOUND");
      }

      const exists = await tx.tag.findUnique({
        where: { name: nextName },
        select: { id: true },
      });
      if (exists && exists.id !== current.id) {
        return errorResponse("标签已存在", 409, "TAG_EXISTS");
      }

      const updated = await tx.tag.update({
        where: { id: current.id },
        data: { name: nextName },
        select: {
          id: true,
          numId: true,
          name: true,
          _count: { select: { memes: true } },
        },
      });

      return successResponse(
        {
          item: {
            id: updated.id,
            numId: updated.numId,
            name: updated.name,
            count: updated._count.memes,
          },
        },
        "已更新",
      );
    }),
  );
}
