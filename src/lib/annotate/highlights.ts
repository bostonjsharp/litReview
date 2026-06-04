import type { TextSegment } from "./offsets";

export interface HlAnnotation { id: string; charStart: number; charEnd: number }
export interface SegmentPart { text: string; annId?: string }

// Split a rendered segment into parts, marking sub-ranges covered by annotations.
// Offsets are absolute into full_text; the segment occupies [offset, offset+len).
// Assumes non-overlapping annotations (overlaps: first one wins for the shared span).
export function sliceSegment(seg: TextSegment, annotations: HlAnnotation[]): SegmentPart[] {
  const segStart = seg.offset;
  const segEnd = seg.offset + seg.text.length;
  const hits = annotations
    .map((a) => ({ id: a.id, s: Math.max(a.charStart, segStart), e: Math.min(a.charEnd, segEnd) }))
    .filter((a) => a.e > a.s)
    .sort((a, b) => a.s - b.s);
  if (hits.length === 0) return [{ text: seg.text }];

  const parts: SegmentPart[] = [];
  let cursor = segStart;
  for (const h of hits) {
    if (h.s < cursor) continue; // skip overlap
    if (h.s > cursor) parts.push({ text: seg.text.slice(cursor - segStart, h.s - segStart) });
    parts.push({ text: seg.text.slice(h.s - segStart, h.e - segStart), annId: h.id });
    cursor = h.e;
  }
  if (cursor < segEnd) parts.push({ text: seg.text.slice(cursor - segStart) });
  return parts;
}

// Given the ordered sequence of annotation ids rendered across the document (null for
// plain-text parts), returns a parallel boolean[] flagging the FIRST appearance of each
// id. Used to give exactly one stable anchor (#hl-<id>) per annotation, even when its
// highlight is split across paragraphs.
export function firstOccurrenceFlags(annIds: (string | null)[]): boolean[] {
  const seen = new Set<string>();
  return annIds.map((id) => {
    if (id == null || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
