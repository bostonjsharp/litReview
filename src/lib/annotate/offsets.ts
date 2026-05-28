export interface TextSegment {
  offset: number;
  text: string;
}

export interface SelectionPoint {
  base: number; // the segment's base offset in full_text
  local: number; // char offset within that segment
}

// Splits full_text into rendered segments (one per line), tracking the absolute
// character offset where each segment begins. Empty lines are dropped from the
// output but still advance the offset, so offsets always map back into full_text.
export function splitIntoSegments(fullText: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let offset = 0;
  for (const line of fullText.split('\n')) {
    if (line.length > 0) segments.push({ offset, text: line });
    offset += line.length + 1; // +1 for the consumed '\n'
  }
  return segments;
}

export function resolveSelection(a: SelectionPoint, b: SelectionPoint): { charStart: number; charEnd: number } {
  const p = a.base + a.local;
  const q = b.base + b.local;
  return { charStart: Math.min(p, q), charEnd: Math.max(p, q) };
}
