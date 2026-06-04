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

// Returns the `offset` of the rendered segment (paragraph) that contains `charOffset` —
// i.e. the last segment whose start is at or before it. Clamps before the first segment
// and after the last; returns null when there are no segments. Used to scroll a `?at=`
// deep-link to the right paragraph.
export function segmentOffsetForChar(segments: TextSegment[], charOffset: number): number | null {
  if (segments.length === 0) return null;
  let result = segments[0].offset;
  for (const seg of segments) {
    if (seg.offset <= charOffset) result = seg.offset;
    else break;
  }
  return result;
}
