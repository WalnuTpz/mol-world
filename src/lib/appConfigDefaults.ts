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
  uploadGlobalCooldownSeconds: 5,
  reviewQueueLimit: 150,
  managePageLimit: 12,
  reviewPageLimit: 12,
  logPageLimit: 20,
  tagPageLimit: 20,
  maxTags: 8,
  maxCnTagLength: 10,
  maxEnTagLength: 20,
  copyCooldownSeconds: 3,
  randomCooldownSeconds: 5,
  downloadCooldownSeconds: 10,
  loginCooldownHours: 24,
  adminSessionDays: 7,
} as const;

export type AppConfigKey = keyof typeof APP_CONFIG_DEFAULTS;

export type AppConfig = {
  [K in AppConfigKey]: number;
};

export type AppConfigRule = {
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
  downloadCooldownSeconds: { min: 0, max: 60 },
  loginCooldownHours: { min: 1, max: 168 },
  adminSessionDays: { min: 1, max: 30 },
};
