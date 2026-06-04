// Theme focus filter logic. A highlight "matches" the focus when no theme is focused,
// or when the focused theme is among the highlight's tags. Multi-theme highlights match
// any of their themes — which is exactly why one theme can be spotlighted at a time
// without a color budget.
export function matchesThemeFocus(
  annId: string,
  focusThemeId: string | null,
  tags: Record<string, string[]>,
): boolean {
  if (!focusThemeId) return true;
  return (tags[annId] ?? []).includes(focusThemeId);
}

export function isDimmed(
  annId: string,
  focusThemeId: string | null,
  tags: Record<string, string[]>,
): boolean {
  return focusThemeId != null && !matchesThemeFocus(annId, focusThemeId, tags);
}
