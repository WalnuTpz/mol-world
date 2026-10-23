export const formatCount = (value: number): string => {
  if (!Number.isFinite(value)) return "0";
  const safe = Math.max(0, value);
  if (safe < 1000) return String(Math.floor(safe));
  if (safe >= 9_990_000) return "9.99M";
  if (safe >= 1_000_000) {
    const truncated = Math.floor((safe / 1_000_000) * 100) / 100;
    return `${truncated.toFixed(2)}M`;
  }
  const truncated = Math.floor((safe / 1000) * 100) / 100;
  return `${truncated.toFixed(2)}K`;
};
