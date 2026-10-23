import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { withDatabaseWrite } from "./databaseWrite";

export type Limit = { key: string; maximum: number; windowMs: number };
export class RateLimitError extends Error {
  constructor(public readonly retryAfter: number) {
    super("操作过于频繁，请稍后再试");
  }
}
export function clientKey(request: Request) {
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  const address = forwarded || request.headers.get("x-real-ip") || "unknown";
  return createHash("sha256").update(address).digest("hex");
}

// Caller holds the database write lock and transaction, allowing a group of
// limits to be consumed atomically with the operation they protect.
export async function consumeLimits(
  tx: Prisma.TransactionClient,
  limits: Limit[],
  now = new Date(),
) {
  const active = limits.filter((limit) => limit.windowMs > 0);
  const rows = await tx.rateLimit.findMany({
    where: { key: { in: active.map((limit) => limit.key) } },
  });
  const byKey = new Map(rows.map((row) => [row.key, row]));
  let retryAfter = 0;
  for (const limit of active) {
    const row = byKey.get(limit.key);
    if (row && row.resetAt > now && row.count >= limit.maximum)
      retryAfter = Math.max(
        retryAfter,
        Math.ceil((row.resetAt.getTime() - now.getTime()) / 1000),
      );
  }
  if (retryAfter) throw new RateLimitError(retryAfter);
  await tx.rateLimit.deleteMany({ where: { resetAt: { lte: now } } });
  const results = [];
  for (const limit of active) {
    const current = byKey.get(limit.key);
    const resetAt =
      current && current.resetAt > now
        ? current.resetAt
        : new Date(now.getTime() + limit.windowMs);
    const count = current && current.resetAt > now ? current.count + 1 : 1;
    await tx.rateLimit.upsert({
      where: { key: limit.key },
      create: { key: limit.key, count, resetAt },
      update: { count, resetAt },
    });
    results.push({ remaining: limit.maximum - count, resetAt });
  }
  return results;
}
export function consumeRateLimits(limits: Limit[]) {
  return withDatabaseWrite(() =>
    prisma.$transaction((tx) => consumeLimits(tx, limits)),
  );
}
export function clearRateLimit(key: string) {
  return withDatabaseWrite(() =>
    prisma.rateLimit.deleteMany({ where: { key } }),
  );
}
