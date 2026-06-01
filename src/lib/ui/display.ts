export function initials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

// Stable per-id color drawn from a calm academic palette (used for collection
// dots and member avatars — the schema has no color column).
const PALETTE = [
  "oklch(0.47 0.08 162)", "oklch(0.55 0.11 250)", "oklch(0.58 0.12 30)",
  "oklch(0.55 0.1 300)", "oklch(0.6 0.1 90)", "oklch(0.52 0.1 200)",
];
export function colorForId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
