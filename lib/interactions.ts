import { randomBytes } from "node:crypto";
import { stat } from "node:fs/promises";
import { prisma } from "./db";
import { withDatabaseWrite } from "./databaseWrite";
import { getAppConfig } from "./appConfig";
import { clientKey, consumeLimits } from "./rateLimit";
import { visitorHash, tokenDigest } from "./visitors";
import { mediaPath } from "./mediaFiles";

export class InteractionError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}
export type InteractionKind = "copy" | "download";
const GRANT_MS = 5 * 60_000;

export async function prepareInteraction(
  request: Request,
  memeId: string,
  kind: InteractionKind,
) {
  const hash = await visitorHash(request);
  if (!hash) throw new InteractionError("请先打开首页，再执行此操作", 401);
  const config = await getAppConfig();
  const token = randomBytes(32).toString("hex");
  const now = new Date();
  const seconds =
    kind === "copy"
      ? config.copyCooldownSeconds
      : config.downloadCooldownSeconds;
  return withDatabaseWrite(() =>
    prisma.$transaction(async (tx) => {
      const meme = await tx.meme.findUnique({
        where: { id: memeId, status: "PUBLISHED" },
        select: {
          mediaUrl: true,
          thumbUrl: true,
          type: true,
          copies: true,
          downloads: true,
        },
      });
      if (!meme) throw new InteractionError("资源不存在", 404);
      try {
        if (!(await stat(mediaPath(meme.mediaUrl))).isFile())
          throw new InteractionError("资源不存在", 404);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT")
          throw new InteractionError("资源不存在", 404);
        throw error;
      }
      await consumeLimits(
        tx,
        [
          {
            key: `interaction:${kind}:visitor:${hash}`,
            maximum: 1,
            windowMs: seconds * 1000,
          },
          {
            key: `interaction:${kind}:ip:${clientKey(request)}`,
            maximum: 10,
            windowMs: Math.max(seconds, 1) * 1000,
          },
        ],
        now,
      );
      await tx.interactionGrant.deleteMany({
        where: { expiresAt: { lte: now } },
      });
      await tx.interactionGrant.create({
        data: {
          tokenHash: tokenDigest(token),
          visitorHash: hash,
          memeId,
          kind,
          expiresAt: new Date(now.getTime() + GRANT_MS),
        },
      });
      return { token, item: meme };
    }),
  );
}

export async function validateInteraction(
  request: Request,
  memeId: string,
  kind: InteractionKind,
  token: unknown,
) {
  const hash = await visitorHash(request);
  if (!hash) throw new InteractionError("访客会话已失效", 401);
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token))
    throw new InteractionError("操作凭据无效", 400);
  const grant = await prisma.interactionGrant.findUnique({
    where: { tokenHash: tokenDigest(token) },
  });
  if (
    !grant ||
    grant.visitorHash !== hash ||
    grant.memeId !== memeId ||
    grant.kind !== kind ||
    grant.expiresAt <= new Date()
  )
    throw new InteractionError("操作凭据已失效", 403);
  if (grant.consumedAt) throw new InteractionError("该操作已经记录", 409);
  return grant;
}

export async function completeInteraction(
  request: Request,
  memeId: string,
  kind: InteractionKind,
  token: unknown,
) {
  // Validation and consumption share the database lock, including worker races.
  return withDatabaseWrite(async () => {
    const grant = await validateInteraction(request, memeId, kind, token);
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    return prisma.$transaction(async (tx) => {
      const meme = await tx.meme.findUnique({
        where: { id: memeId, status: "PUBLISHED" },
        select: { id: true },
      });
      if (!meme) throw new InteractionError("资源不存在", 404);
      await tx.interactionGrant.update({
        where: { tokenHash: grant.tokenHash },
        data: { consumedAt: now },
      });
      const column = kind === "copy" ? "copies" : "downloads";
      const item = await tx.meme.update({
        where: { id: memeId },
        data: { [column]: { increment: 1 } },
        select: { id: true, copies: true, downloads: true },
      });
      await tx.memeDailyStat.upsert({
        where: { day_memeId: { day, memeId } },
        create: {
          day,
          memeId,
          copies: kind === "copy" ? 1 : 0,
          downloads: kind === "download" ? 1 : 0,
        },
        update: { [column]: { increment: 1 } },
      });
      return item;
    });
  });
}
