export interface ExportEntry {
  position: number;
  kind: 'prose' | 'annotation';
  prose: string | null;
  annotationId: string | null;
}
export interface ExportAnn {
  quote: string;
  page: number | null;
  sourceLabel: string;
}

// Renders a review's ordered blocks to markdown: a title heading, prose paragraphs, and
// annotation entries as blockquotes with their source. Empty prose and unknown
// annotations are skipped. Deterministic — safe to unit-test and to build downloads from.
export function reviewToMarkdown(
  title: string,
  entries: ExportEntry[],
  annLookup: Record<string, ExportAnn>,
): string {
  const lines: string[] = [`# ${title.trim() || 'Untitled review'}`, ''];
  for (const e of [...entries].sort((a, b) => a.position - b.position)) {
    if (e.kind === 'prose') {
      const text = (e.prose ?? '').trim();
      if (text) lines.push(text, '');
    } else if (e.kind === 'annotation' && e.annotationId) {
      const a = annLookup[e.annotationId];
      if (a) {
        const src = a.page != null ? `${a.sourceLabel} · p.${a.page}` : a.sourceLabel;
        lines.push(`> "${a.quote}" — ${src}`, '');
      }
    }
  }
  return lines.join('\n').trimEnd() + '\n';
}
