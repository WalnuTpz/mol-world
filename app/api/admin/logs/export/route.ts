import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { requireAdmin } from "@/lib/adminAuth";
import { normalizeSearchTokens } from "@/lib/tags";

const escapeCsv = (value: string | null | undefined) => {
  const input = value ?? "";
  const raw = /^[=+@\-\t\r]/.test(input) ? `'${input}` : input;
  const needsQuote = /[",\r\n]/.test(raw);
  const escaped = raw.replace(/"/g, '""');
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
  const { searchParams } = new URL(request.url);
  const range = searchParams.get("range") ?? "7d";
  const q = (searchParams.get("q") ?? "").trim();

  if (!["3d", "7d", "30d", "all"].includes(range)) {
    return errorResponse("无效的导出范围", 400, "INVALID_RANGE");
  }

  const since = resolveSince(range);
  const tokens = q ? normalizeSearchTokens(q) : [];
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

  const startedAt = new Date();
  type Cursor = { id: string; createdAt: Date };
  const load = (cursor?: Cursor) => {
    const boundary: Prisma.AuditLogWhereInput = cursor
      ? {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        }
      : {};
    return prisma.auditLog.findMany({
      where: { AND: [where, { createdAt: { lte: startedAt } }, boundary] },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 500,
      select: {
        id: true,
        action: true,
        status: true,
        targetType: true,
        targetId: true,
        message: true,
        createdAt: true,
      },
    });
  };
  try {
    let page = await load();
    let first = true;
    let canceled = false;
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          if (first) {
            first = false;
            controller.enqueue(
              encoder.encode("\uFEFF时间,动作,状态,目标类型,目标ID,消息"),
            );
            return;
          }
          if (!page.length) {
            controller.close();
            return;
          }
          const last = page[page.length - 1];
          const csv = page
            .map((item) =>
              [
                formatTime(item.createdAt),
                item.action,
                item.status === "success" ? "成功" : "失败",
                item.targetType,
                item.targetId,
                item.message,
              ]
                .map(escapeCsv)
                .join(","),
            )
            .join("\n");
          controller.enqueue(encoder.encode(`\n${csv}`));
          page = page.length === 500 ? await load(last) : [];
        } catch (error) {
          if (!canceled) controller.error(error);
        }
      },
      cancel() {
        canceled = true;
      },
    });
    const stamp = startedAt.toISOString().slice(0, 10).replace(/-/g, "");
    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="audit-logs-${range}-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "导出失败",
      500,
    );
  }
}
