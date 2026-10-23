import { randomBytes, createHash } from "node:crypto";
import { prisma } from "./db";
import { withDatabaseWrite } from "./databaseWrite";
import { getCookieValue } from "./adminAuth";

export const VISITOR_COOKIE = "molworld_visitor";
const YEAR_SECONDS = 365 * 24 * 60 * 60;
export const tokenDigest = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export async function visitorHash(request: Request) {
  const token = getCookieValue(request, VISITOR_COOKIE);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const hash = tokenDigest(token);
  const row = await prisma.visitorSession.findUnique({
    where: { tokenHash: hash },
  });
  return row && row.expiresAt > new Date() ? hash : null;
}

export async function createVisitor() {
  const token = randomBytes(32).toString("hex");
  const now = new Date();
  await withDatabaseWrite(() =>
    prisma.$transaction(async (tx) => {
      await tx.visitorSession.deleteMany({
        where: { expiresAt: { lte: now } },
      });
      await tx.visitorSession.create({
        data: {
          tokenHash: tokenDigest(token),
          expiresAt: new Date(now.getTime() + YEAR_SECONDS * 1000),
        },
      });
    }),
  );
  return token;
}

export function visitorCookie(token: string) {
  return `${VISITOR_COOKIE}=${token}; Path=/; Max-Age=${YEAR_SECONDS}; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}

export async function recordVisit(hash: string, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  const oldest = new Date(now.getTime() - 90 * 86400000)
    .toISOString()
    .slice(0, 10);
  return withDatabaseWrite(() =>
    prisma.$transaction(async (tx) => {
      await tx.siteDailyVisitor.deleteMany({ where: { day: { lt: oldest } } });
      const added =
        await tx.$executeRaw`INSERT OR IGNORE INTO SiteDailyVisitor (day, visitorHash) VALUES (${day}, ${hash})`;
      return tx.siteDailyStat.upsert({
        where: { day },
        create: { day, visits: 1, visitors: added },
        update: { visits: { increment: 1 }, visitors: { increment: added } },
      });
    }),
  );
}
