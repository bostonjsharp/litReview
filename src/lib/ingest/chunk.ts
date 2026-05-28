import type { Chunk } from '../llm/types-shared';

const CHARS_PER_TOKEN = 4;

export interface ChunkOpts {
  maxTokens?: number;
  overlapTokens?: number;
}

export function chunkText(text: string, opts: ChunkOpts = {}): Chunk[] {
  const maxChars = (opts.maxTokens ?? 500) * CHARS_PER_TOKEN;
  const overlapChars = (opts.overlapTokens ?? 60) * CHARS_PER_TOKEN;
  const step = Math.max(1, maxChars - overlapChars);
  if (text.length <= maxChars) {
    return text.length === 0 ? [] : [{ index: 0, text, charStart: 0, charEnd: text.length, page: null }];
  }
  const chunks: Chunk[] = [];
  let start = 0;
  let index = 0;
  while (start < text.length) {
    const end = Math.min(start + maxChars, text.length);
    chunks.push({ index, text: text.slice(start, end), charStart: start, charEnd: end, page: null });
    index++;
    if (end === text.length) break;
    start += step;
  }
  return chunks;
}

export function pageForOffset(pageOffsets: number[], charStart: number): number {
  let page = 1;
  for (let i = 0; i < pageOffsets.length; i++) {
    if (charStart >= pageOffsets[i]) page = i + 1;
    else break;
  }
  return page;
}
