const MAX_OFFSET = 2_147_483_647;

export function positiveInteger(
  value: string | null | undefined,
  fallback: number,
) {
  if (!value || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= MAX_OFFSET
    ? parsed
    : fallback;
}

export function pagination(
  pageInput: string | null | undefined,
  limitInput: string | null | undefined,
  maximum: number,
) {
  const limit = Math.min(positiveInteger(limitInput, maximum), maximum);
  const page = Math.min(
    positiveInteger(pageInput, 1),
    Math.floor(MAX_OFFSET / limit) + 1,
  );
  return { page, limit, skip: (page - 1) * limit };
}
