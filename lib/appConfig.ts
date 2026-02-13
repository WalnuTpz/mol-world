import { prisma } from "@/lib/db";

export const APP_CONFIG_DEFAULTS = {
  dailyPoolGroups: 20,
  dailyPoolSize: 24,
  hotLimit: 24,
  listLimit: 24,
  cacheListSeconds: 30,
  cacheHotSeconds: 30,
  cacheSearchSeconds: 30,
  uploadMaxSizeMb: 10,
  uploadCooldownSeconds: 60,
  uploadGlobalCooldownSeconds: 10,
  reviewQueueLimit: 100,
  managePageLimit: 12,
  reviewPageLimit: 12,
  logPageLimit: 20,
  tagPageLimit: 20,
  maxTags: 8,
  maxCnTagLength: 10,
  maxEnTagLength: 20,
  copyCooldownSeconds: 5,
  randomCooldownSeconds: 5,
  loginCooldownHours: 24,
  adminSessionDays: 7,
} as const;

export type AppConfigKey = keyof typeof APP_CONFIG_DEFAULTS;

export type AppConfig = {
  [K in AppConfigKey]: number;
};

type AppConfigRule = {
  min: number;
  max: number;
};

export const APP_CONFIG_RULES: Record<AppConfigKey, AppConfigRule> = {
  dailyPoolGroups: { min: 1, max: 60 },
  dailyPoolSize: { min: 1, max: 60 },
  hotLimit: { min: 1, max: 60 },
  listLimit: { min: 6, max: 60 },
  cacheListSeconds: { min: 0, max: 3600 },
  cacheHotSeconds: { min: 0, max: 3600 },
  cacheSearchSeconds: { min: 0, max: 3600 },
  uploadMaxSizeMb: { min: 1, max: 50 },
  uploadCooldownSeconds: { min: 0, max: 600 },
  uploadGlobalCooldownSeconds: { min: 0, max: 600 },
  reviewQueueLimit: { min: 0, max: 1000 },
  managePageLimit: { min: 4, max: 30 },
  reviewPageLimit: { min: 4, max: 30 },
  logPageLimit: { min: 5, max: 50 },
  tagPageLimit: { min: 5, max: 50 },
  maxTags: { min: 1, max: 12 },
  maxCnTagLength: { min: 2, max: 20 },
  maxEnTagLength: { min: 2, max: 30 },
  copyCooldownSeconds: { min: 0, max: 60 },
  randomCooldownSeconds: { min: 0, max: 60 },
  loginCooldownHours: { min: 1, max: 168 },
  adminSessionDays: { min: 1, max: 30 },
};

const CACHE_TTL_MS = 10_000;
let cachedConfig: { value: AppConfig; expiresAt: number } | null = null;

const sanitizeValue = (key: AppConfigKey, raw: unknown) => {
  const rule = APP_CONFIG_RULES[key];
  const num = Number(raw);
  if (!Number.isFinite(num)) return null;
  const value = Math.round(num);
  if (value < rule.min || value > rule.max) return null;
  return value;
};

const buildConfig = (rows: { key: string; value: string }[]): AppConfig => {
  const config: AppConfig = { ...APP_CONFIG_DEFAULTS };
  for (const row of rows) {
    if (!(row.key in config)) continue;
    const key = row.key as AppConfigKey;
    const value = sanitizeValue(key, row.value);
    if (value === null) continue;
    config[key] = value;
  }
  return config;
};

export const getAppConfig = async (): Promise<AppConfig> => {
  if (cachedConfig && cachedConfig.expiresAt > Date.now()) {
    return cachedConfig.value;
  }
  const delegate = (prisma as { appConfig?: { findMany: typeof prisma.meme.findMany } })
    .appConfig;
  if (!delegate?.findMany) {
    return { ...APP_CONFIG_DEFAULTS };
  }
  const rows = await delegate.findMany({
    select: {
      key: true,
      value: true,
    },
  });
  const config = buildConfig(rows);
  cachedConfig = { value: config, expiresAt: Date.now() + CACHE_TTL_MS };
  return config;
};

export const invalidateAppConfigCache = () => {
  cachedConfig = null;
};

export const updateAppConfig = async (
  updates: Partial<Record<AppConfigKey, number | string>>
) => {
  const delegate = (prisma as { appConfig?: { upsert: typeof prisma.meme.upsert } })
    .appConfig;
  if (!delegate?.upsert) {
    return { ok: false as const, error: "参数表未就绪，请先迁移数据库" };
  }
  const entries = Object.entries(updates);
  if (entries.length === 0) {
    return { ok: false as const, error: "没有可保存的参数" };
  }

  const normalized: Partial<AppConfig> = {};
  for (const [key, raw] of entries) {
    if (!(key in APP_CONFIG_DEFAULTS)) {
      return { ok: false as const, error: `未知参数：${key}` };
    }
    const typedKey = key as AppConfigKey;
    const value = sanitizeValue(typedKey, raw);
    if (value === null) {
      const rule = APP_CONFIG_RULES[typedKey];
      return {
        ok: false as const,
        error: `${typedKey} 需在 ${rule.min} - ${rule.max} 范围内`,
      };
    }
    normalized[typedKey] = value;
  }

  await prisma.$transaction(
    Object.entries(normalized).map(([key, value]) =>
      delegate.upsert({
        where: { key },
        create: { key, value: String(value) },
        update: { value: String(value) },
      })
    )
  );

  invalidateAppConfigCache();
  const config = await getAppConfig();
  return { ok: true as const, config };
};

export const getTagRulesFromConfig = (config: AppConfig) => ({
  maxTags: config.maxTags,
  maxCn: config.maxCnTagLength,
  maxEn: config.maxEnTagLength,
});

export const buildCacheControl = (seconds: number) =>
  seconds > 0 ? `public, max-age=0, s-maxage=${seconds}` : "no-store";
