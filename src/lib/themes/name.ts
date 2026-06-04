// Normalizes a user-typed theme name. Returns the trimmed name, or null when there
// is nothing meaningful to create (empty / whitespace-only).
export function normalizeThemeName(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}
