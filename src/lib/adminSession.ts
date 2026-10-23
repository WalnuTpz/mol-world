import crypto from "node:crypto";
import { promisify } from "node:util";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { withDatabaseWrite } from "./databaseWrite";

const SESSION_COOKIE = "admin_session";
const scrypt = promisify(crypto.scrypt);
type AdminCredential = { user: string; passHash: string; salt: string };
let environmentCredential: Promise<AdminCredential | null> | undefined;

export const getAdminSessionCookieName = () => SESSION_COOKIE;
export const buildAdminSessionCookie = (token: string, maxAge: number) =>
  `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
export const buildAdminClearCookie = () => buildAdminSessionCookie("", 0);

const hashPassword = async (pass: string, salt: string) =>
  ((await scrypt(pass, salt, 32)) as Buffer).toString("hex");
const digest = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex");

async function readEnvironmentCredential(): Promise<AdminCredential | null> {
  const user = process.env.REVIEW_USER;
  const pass = process.env.REVIEW_PASS;
  if (!user || !pass) return null;
  return { user, salt: user, passHash: await hashPassword(pass, user) };
}

export async function getAdminCredential(
  client: Prisma.TransactionClient = prisma,
): Promise<AdminCredential | null> {
  // Route and proxy bundles can have separate module caches. Always read saved
  // credentials so a password change is visible to every session check at once.
  const stored = await client.adminCredential.findFirst({
    select: { user: true, passHash: true, salt: true },
    orderBy: { updatedAt: "desc" },
  });
  if (stored) return stored;
  // Environment configuration is fixed for the lifetime of the process.
  environmentCredential ??= readEnvironmentCredential();
  return environmentCredential;
}

export async function verifyAdminPassword(user: string, pass: string) {
  const credential = await getAdminCredential();
  if (!credential) return { ok: false as const, error: "管理员账号未配置" };
  const candidate = await hashPassword(pass, credential.salt);
  if (
    user !== credential.user ||
    !crypto.timingSafeEqual(
      Buffer.from(candidate, "hex"),
      Buffer.from(credential.passHash, "hex"),
    )
  ) {
    return { ok: false as const, error: "账号或密码错误" };
  }
  return { ok: true as const, credential };
}

export class StaleCredentialError extends Error {}

async function insertSession(
  tx: Prisma.TransactionClient,
  credential: AdminCredential,
  maxAge: number,
) {
  const token = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  await tx.adminSession.deleteMany({ where: { expiresAt: { lte: now } } });
  await tx.adminSession.create({
    data: {
      tokenHash: digest(token),
      user: credential.user,
      credentialHash: digest(credential.passHash),
      expiresAt: new Date(now.getTime() + maxAge * 1000),
    },
  });
  return token;
}

export async function createAdminSession(
  credential: Pick<AdminCredential, "user" | "passHash">,
  maxAge: number,
) {
  return withDatabaseWrite(() =>
    prisma.$transaction(async (tx) => {
      const current = await getAdminCredential(tx);
      if (
        !current ||
        current.user !== credential.user ||
        current.passHash !== credential.passHash
      )
        throw new StaleCredentialError("Credentials changed during login");
      return insertSession(tx, current, maxAge);
    }),
  );
}

async function sessionCredential(
  value: string | null | undefined,
  client: Prisma.TransactionClient,
) {
  if (!value || !/^[a-f0-9]{64}$/.test(value)) return null;
  const session = await client.adminSession.findUnique({
    where: { tokenHash: digest(value) },
  });
  if (!session || session.expiresAt.getTime() <= Date.now()) return null;
  const credential = await getAdminCredential(client);
  return credential &&
    session.user === credential.user &&
    session.credentialHash === digest(credential.passHash)
    ? credential
    : null;
}

export async function isAdminSessionValid(value?: string | null) {
  return !!(await sessionCredential(value, prisma));
}

export async function revokeAdminSession(value: string | null) {
  if (value)
    await withDatabaseWrite(() =>
      prisma.adminSession.deleteMany({ where: { tokenHash: digest(value) } }),
    );
}

export async function updateAdminPassword(
  token: string | null,
  newPass: string,
  maxAge: number,
) {
  const salt = crypto.randomBytes(16).toString("hex");
  const passHash = await hashPassword(newPass, salt);
  // Validate after reading the request and hashing, inside the same transaction
  // that changes credentials. A revoked or concurrently replaced session loses.
  return withDatabaseWrite(() =>
    prisma.$transaction(async (tx) => {
      const current = await sessionCredential(token, tx);
      if (!current) return { ok: false as const };
      const credential = { user: current.user, salt, passHash };
      await tx.adminCredential.upsert({
        where: { user: current.user },
        create: credential,
        update: { passHash, salt },
      });
      await tx.adminSession.deleteMany();
      return {
        ok: true as const,
        token: await insertSession(tx, credential, maxAge),
      };
    }),
  );
}
