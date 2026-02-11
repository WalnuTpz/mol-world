import { prisma } from "@/lib/db";

type AuditInput = {
  action: string;
  status: "success" | "error";
  targetType?: string;
  targetId?: string;
  message?: string;
  data?: Record<string, unknown>;
  request?: Request;
};

const getClientMeta = (request?: Request) => {
  if (!request) return {};
  const forwarded = request.headers.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "";
  const ua = request.headers.get("user-agent") ?? "";
  return { actorIp: ip || null, actorUa: ua || null };
};

export const logAudit = async (input: AuditInput) => {
  try {
    const { actorIp, actorUa } = getClientMeta(input.request);
    await prisma.auditLog.create({
      data: {
        action: input.action,
        status: input.status,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        message: input.message ?? null,
        data: input.data ?? undefined,
        actorIp,
        actorUa,
      },
    });
  } catch (error) {
    console.error("audit log failed", error);
  }
};
