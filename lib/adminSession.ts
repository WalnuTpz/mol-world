import crypto from "node:crypto";

import { prisma } from "@/lib/db";

const SESSION_COOKIE = "admin_session";
const CACHE_TTL_MS = 10_000;

type AdminCredential = {
  user: string;
  passHash: string;
  salt: string;
  source: "db" | "env";
};

type AdminCredentialDelegate = {
  findFirst: typeof prisma.adminCredential.findFirst;
  upsert: typeof prisma.adminCredential.upsert;
};

let cachedCredential: { value: AdminCredential | null; expiresAt: number } | null = null;

export const getAdminSessionCookieName = () => SESSION_COOKIE;
const isSecureCookie = () => process.env.NODE_ENV === "production";

export const buildAdminSessionCookie = (token: string, maxAge: number) => {
  const secure = isSecureCookie() ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`;
};

export const buildAdminClearCookie = () => {
  const secure = isSecureCookie() ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`;
};

const hashPassword = (pass: string, salt: string) =>
  crypto.scryptSync(pass, salt, 32).toString("hex");

export const buildAdminSessionToken = (user: string, passHash: string) =>
  Buffer.from(`${user}:${passHash}`, "utf8").toString("base64");

const buildCredentialFromEnv = () => {
  const user = process.env.REVIEW_USER;
  const pass = process.env.REVIEW_PASS;
  if (!user || !pass) return null;
  const salt = user;
  const passHash = hashPassword(pass, salt);
  return {
    user,
    passHash,
    salt,
    source: "env" as const,
  };
};

export const getAdminCredential = async (): Promise<AdminCredential | null> => {
  if (cachedCredential && cachedCredential.expiresAt > Date.now()) {
    return cachedCredential.value;
  }
  const delegate = (prisma as unknown as {
    adminCredential?: AdminCredentialDelegate;
  }).adminCredential;
  if (delegate?.findFirst) {
    const row = await delegate.findFirst({
      select: { user: true, passHash: true, salt: true },
      orderBy: { updatedAt: "desc" },
    });
    if (row) {
      const value: AdminCredential = { ...row, source: "db" };
      cachedCredential = { value, expiresAt: Date.now() + CACHE_TTL_MS };
      return value;
    }
  }
  const fallback = buildCredentialFromEnv();
  cachedCredential = { value: fallback, expiresAt: Date.now() + CACHE_TTL_MS };
  return fallback;
};

export const invalidateAdminCredentialCache = () => {
  cachedCredential = null;
};

export const getAdminSessionToken = async () => {
  const credential = await getAdminCredential();
  if (!credential) return null;
  return buildAdminSessionToken(credential.user, credential.passHash);
};

export const verifyAdminPassword = async (user: string, pass: string) => {
  const credential = await getAdminCredential();
  if (!credential) {
    return { ok: false as const, error: "管理员账号未配置" };
  }
  if (user.trim() !== credential.user) {
    return { ok: false as const, error: "账号或密码错误" };
  }
  const passHash = hashPassword(pass, credential.salt);
  if (passHash !== credential.passHash) {
    return { ok: false as const, error: "账号或密码错误" };
  }
  return { ok: true as const, credential };
};

export const updateAdminPassword = async (user: string, newPass: string) => {
  const delegate = (prisma as unknown as {
    adminCredential?: AdminCredentialDelegate;
  }).adminCredential;
  if (!delegate?.upsert) {
    return { ok: false as const, error: "账号表未就绪，请先迁移数据库" };
  }
  const salt = crypto.randomBytes(16).toString("hex");
  const passHash = hashPassword(newPass, salt);
  await delegate.upsert({
    where: { user },
    create: { user, passHash, salt },
    update: { passHash, salt },
  });
  invalidateAdminCredentialCache();
  return { ok: true as const, credential: { user, passHash, salt } };
};

export const isAdminSessionValid = async (value?: string | null) => {
  if (!value) return false;
  const credential = await getAdminCredential();
  if (!credential) return false;
  const expected = buildAdminSessionToken(
    credential.user,
    credential.passHash
  );
  if (value === expected) return true;
  if (credential.source === "env") {
    const pass = process.env.REVIEW_PASS;
    if (pass) {
      const legacy = Buffer.from(`${credential.user}:${pass}`, "utf8").toString(
        "base64"
      );
      return value === legacy;
    }
  }
  return false;
};
