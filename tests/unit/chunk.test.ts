import { describe, it, expect } from 'vitest';
import { chunkText, pageForOffset } from '@/lib/ingest/chunk';

describe('chunkText', () => {
  it('returns one chunk for short text', () => {
    const out = chunkText('hello world', { maxTokens: 100, overlapTokens: 10 });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ index: 0, text: 'hello world', charStart: 0, charEnd: 11, page: null });
  });

  it('splits long text into overlapping chunks with correct offsets', () => {
    const text = 'a'.repeat(4000); // ~1000 tokens at 4 chars/token
    const out = chunkText(text, { maxTokens: 100, overlapTokens: 20 });
    expect(out.length).toBeGreaterThan(1);
    expect(out[0].charStart).toBe(0);
    expect(out[out.length - 1].charEnd).toBe(4000);
    expect(out[1].charStart).toBeLessThan(out[0].charEnd);
    expect(out[0].text).toBe(text.slice(out[0].charStart, out[0].charEnd));
  });
});

describe('pageForOffset', () => {
  it('maps a char offset to its 1-based page', () => {
    const offsets = [0, 100, 250];
    expect(pageForOffset(offsets, 0)).toBe(1);
    expect(pageForOffset(offsets, 99)).toBe(1);
    expect(pageForOffset(offsets, 100)).toBe(2);
    expect(pageForOffset(offsets, 300)).toBe(3);
  });
});
