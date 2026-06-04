// Derives a chat title from its first question — trimmed, whitespace-collapsed, and
// truncated to <=60 chars on a word boundary (with an ellipsis). Empty → "New chat".
export function titleFromQuestion(q: string): string {
  const clean = q.trim().replace(/\s+/g, ' ');
  if (!clean) return 'New chat';
  if (clean.length <= 60) return clean;
  const cut = clean.slice(0, 60);
  const lastSpace = cut.lastIndexOf(' ');
  const base = lastSpace > 30 ? cut.slice(0, lastSpace) : cut;
  return base + '…';
}
