const TAG_ALLOWED_RE = /[a-z0-9_\u4e00-\u9fff]/gi;
const HAS_CHINESE_RE = /[\u4e00-\u9fff]/;
const TAG_SPLIT_RE = /[\s,，、;；]+/;

const MAX_TAGS = 8;
const MAX_CN = 10;
const MAX_EN = 20;

export type TagRules = {
  maxTags?: number;
  maxCn?: number;
  maxEn?: number;
};

const tagCollator = new Intl.Collator("zh-Hans-CN", {
  sensitivity: "base",
  numeric: true,
});

const resolveRules = (rules?: TagRules) => ({
  maxTags: rules?.maxTags ?? MAX_TAGS,
  maxCn: rules?.maxCn ?? MAX_CN,
  maxEn: rules?.maxEn ?? MAX_EN,
});

const normalizeTag = (raw: string, rules?: TagRules) => {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const lowered = trimmed.toLowerCase();
  const cleaned = (lowered.match(TAG_ALLOWED_RE) ?? []).join("");
  if (!cleaned) return "";
  const resolved = resolveRules(rules);
  const limit = HAS_CHINESE_RE.test(cleaned) ? resolved.maxCn : resolved.maxEn;
  return [...cleaned].slice(0, limit).join("");
};

export const normalizeTags = (
  tags: string[],
  limitOrRules: number | TagRules = MAX_TAGS,
  rulesOverride?: TagRules
) => {
  const rules =
    typeof limitOrRules === "number"
      ? resolveRules(rulesOverride)
      : resolveRules(limitOrRules);
  const limit =
    typeof limitOrRules === "number"
      ? limitOrRules
      : rules.maxTags;
  const result: string[] = [];
  const seen = new Set<string>();

  for (const raw of tags) {
    const normalized = normalizeTag(raw, rules);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= limit) break;
  }

  return result;
};

export const sortTags = (tags: string[]) =>
  [...tags].sort((a, b) => tagCollator.compare(a, b));

export const splitTagInput = (input: string) =>
  input.split(TAG_SPLIT_RE).map((tag) => tag.trim()).filter(Boolean);

export const normalizeTagInput = (
  input: string | string[],
  limitOrRules: number | TagRules = MAX_TAGS,
  rulesOverride?: TagRules
) =>
  normalizeTags(
    Array.isArray(input) ? input : splitTagInput(input),
    limitOrRules,
    rulesOverride
  );

export const normalizeSearchTokens = (query: string, rules?: TagRules) =>
  query
    .split(/\s+/)
    .map((token) => normalizeTag(token, rules))
    .filter(Boolean);
