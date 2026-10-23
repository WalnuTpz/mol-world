import { withDatabaseWrite } from "@/lib/databaseWrite";
import { prisma } from "@/lib/db";
import {
  APP_CONFIG_DEFAULTS,
  APP_CONFIG_RULES,
  type AppConfig,
  type AppConfigKey,
} from "@/lib/appConfigDefaults";

const sanitizeValue = (key: AppConfigKey, raw: unknown) => {
  const rule = APP_CONFIG_RULES[key];
  if ((typeof raw !== "number" && typeof raw !== "string") || raw === "")
    return null;
  const num = Number(raw);
  if (!Number.isFinite(num)) return null;
  const value = Math.round(num);
  if (value < rule.min || value > rule.max) return null;
  return value;
};

const buildConfig = (rows: { key: string; value: string }[]): AppConfig => {
  const config: AppConfig = { ...APP_CONFIG_DEFAULTS };
  for (const row of rows) {
    if (!Object.hasOwn(config, row.key)) continue;
    const key = row.key as AppConfigKey;
    const value = sanitizeValue(key, row.value);
    if (value === null) continue;
    config[key] = value;
  }
  return config;
};

export const getAppConfig = async (): Promise<AppConfig> => {
  const rows = await prisma.appConfig.findMany({
    select: {
      key: true,
      value: true,
    },
  });
  const config = buildConfig(rows);
  return config;
};

export const updateAppConfig = async (
  updates: Partial<Record<AppConfigKey, number | string>>,
) => {
  const entries = Object.entries(updates);
  if (entries.length === 0) {
    return { ok: false as const, error: "没有可保存的参数" };
  }

  const normalized: Partial<AppConfig> = {};
  for (const [key, raw] of entries) {
    if (!Object.hasOwn(APP_CONFIG_DEFAULTS, key)) {
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

  await withDatabaseWrite(() =>
    prisma.$transaction(
      Object.entries(normalized).map(([key, value]) =>
        prisma.appConfig.upsert({
          where: { key },
          create: { key, value: String(value) },
          update: { value: String(value) },
        }),
      ),
    ),
  );

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
