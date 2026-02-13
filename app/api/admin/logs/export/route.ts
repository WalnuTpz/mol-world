import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { requireAdmin } from "@/lib/adminAuth";
import { normalizeSearchTokens } from "@/lib/tags";
import { getAppConfig, getTagRulesFromConfig } from "@/lib/appConfig";

const escapeCsv = (value: string | null | undefined) => {
  const raw = value ?? "";
  const needsQuote = /[",\n]/.test(raw);
  const escaped = raw.replace(/"/g, "\"\"");
  return needsQuote ? `"${escaped}"` : escaped;
};

const formatTime = (value: Date) =>
  value.toLocaleString("zh-CN", {
    hour12: false,
  });

const resolveSince = (range: string) => {
  const now = Date.now();
  if (range === "3d") return new Date(now - 3 * 24 * 60 * 60 * 1000);
  if (range === "7d") return new Date(now - 7 * 24 * 60 * 60 * 1000);
  if (range === "30d") return new Date(now - 30 * 24 * 60 * 60 * 1000);
  return null;
};

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  const config = await getAppConfig();
  const tagRules = getTagRulesFromConfig(config);
  const { searchParams } = new URL(request.url);
  const range = searchParams.get("range") ?? "7d";
  const q = (searchParams.get("q") ?? "").trim();

  if (!["3d", "7d", "30d", "all"].includes(range)) {
    return errorResponse("无效的导出范围", 400, "INVALID_RANGE");
  }

  const since = resolveSince(range);
  const tokens = q ? normalizeSearchTokens(q, tagRules) : [];
  const timeFilter = since ? { createdAt: { gte: since } } : {};
  const where =
    tokens.length > 0
      ? {
          AND: [
            timeFilter,
            ...tokens.map((token) => ({
              OR: [
                { action: { contains: token } },
                { message: { contains: token } },
                { targetId: { contains: token } },
                { targetType: { contains: token } },
              ],
            })),
          ],
        }
      : timeFilter;

  try {
    const items = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        action: true,
        status: true,
        targetType: true,
        targetId: true,
        message: true,
        createdAt: true,
      },
    });

    const header = [
      "时间",
      "动作",
      "状态",
      "目标类型",
      "目标ID",
      "消息",
    ];
    const rows = items.map((item) => [
      formatTime(item.createdAt),
      item.action,
      item.status === "success" ? "成功" : "失败",
      item.targetType ?? "",
      item.targetId ?? "",
      item.message ?? "",
    ]);

    const csvBody = [header, ...rows]
      .map((row) => row.map(escapeCsv).join(","))
      .join("\n");
    const csv = `\uFEFF${csvBody}`;
    const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const filename = `audit-logs-${range}-${dateStamp}.csv`;

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=\"${filename}\"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "导出失败";
    return errorResponse(message, 500);
  }
}
