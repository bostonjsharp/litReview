export interface ThemeSuggestion {
  themes: string[];
  assignments: { annotationId: string; themes: string[] }[];
}

export function buildSuggestionPrompt(annotations: { annotationId: string; quote: string; comment: string }[]): string {
  const items = annotations.map((a) => `- id=${a.annotationId}: "${a.quote}" — ${a.comment}`).join('\n');
  return [
    'You are organizing a literature review. Below are annotations (highlighted quotes and notes) from a set of papers.',
    'Propose a small set of cross-cutting themes (3–8) and assign each annotation to the theme(s) it belongs to.',
    'Respond as STRICT JSON only: {"themes": string[], "assignments": [{"annotationId": string, "themes": string[]}]}.',
    'Every theme name used in "assignments" MUST appear in "themes". Use the exact annotation ids given.',
    '',
    'Annotations:',
    items,
  ].join('\n');
}

export function parseSuggestion(raw: string): ThemeSuggestion {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    throw new Error('suggestion JSON is malformed');
  }
  const o = obj as { themes?: unknown; assignments?: unknown };
  if (!o || !Array.isArray(o.themes) || !Array.isArray(o.assignments)) {
    throw new Error('suggestion shape is invalid');
  }
  const themes = (o.themes as unknown[])
    .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
    .map((t) => t.trim());
  const themeSet = new Set(themes);
  const assignments = (o.assignments as unknown[])
    .filter(
      (a): a is { annotationId: string; themes: unknown[] } =>
        !!a &&
        typeof (a as { annotationId?: unknown }).annotationId === 'string' &&
        Array.isArray((a as { themes?: unknown }).themes),
    )
    .map((a) => ({
      annotationId: a.annotationId,
      themes: (a.themes as unknown[]).filter((t): t is string => typeof t === 'string' && themeSet.has(t)),
    }));
  return { themes, assignments };
}
