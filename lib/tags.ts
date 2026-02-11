const TAG_ALLOWED_RE = /[a-z0-9_\u4e00-\u9fff]/gi;
const HAS_CHINESE_RE = /[\u4e00-\u9fff]/;

const MAX_TAGS = 8;
const MAX_CN = 10;
const MAX_EN = 20;

const tagCollator = new Intl.Collator("zh-Hans-CN", {
  sensitivity: "base",
  numeric: true,
});

const normalizeTag = (raw: string) => {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const lowered = trimmed.toLowerCase();
  const cleaned = (lowered.match(TAG_ALLOWED_RE) ?? []).join("");
  if (!cleaned) return "";
  const limit = HAS_CHINESE_RE.test(cleaned) ? MAX_CN : MAX_EN;
  return [...cleaned].slice(0, limit).join("");
};

export const normalizeTags = (tags: string[], limit = MAX_TAGS) => {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const raw of tags) {
    const normalized = normalizeTag(raw);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= limit) break;
  }

  return result;
};

export const sortTags = (tags: string[]) =>
  [...tags].sort((a, b) => tagCollator.compare(a, b));

export const normalizeSearchTokens = (query: string) =>
  query
    .split(/\s+/)
    .map((token) => normalizeTag(token))
    .filter(Boolean);
