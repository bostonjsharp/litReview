import { describe, it, expect } from 'vitest';
import { splitIntoSegments, resolveSelection, segmentOffsetForChar } from '@/lib/annotate/offsets';

describe('splitIntoSegments', () => {
  it('splits on newlines and tracks the base offset of each segment', () => {
    const text = 'alpha\nbeta\ngamma';
    const segs = splitIntoSegments(text);
    expect(segs).toEqual([
      { offset: 0, text: 'alpha' },
      { offset: 6, text: 'beta' },
      { offset: 11, text: 'gamma' },
    ]);
    for (const s of segs) expect(text.slice(s.offset, s.offset + s.text.length)).toBe(s.text);
  });

  it('drops empty segments but keeps offsets correct', () => {
    const text = 'a\n\nb';
    expect(splitIntoSegments(text)).toEqual([
      { offset: 0, text: 'a' },
      { offset: 3, text: 'b' },
    ]);
  });
});

describe('resolveSelection', () => {
  it('returns a normalized start<end range from two points', () => {
    expect(resolveSelection({ base: 6, local: 1 }, { base: 0, local: 2 })).toEqual({ charStart: 2, charEnd: 7 });
  });
  it('handles forward selection', () => {
    expect(resolveSelection({ base: 0, local: 0 }, { base: 0, local: 5 })).toEqual({ charStart: 0, charEnd: 5 });
  });
});

describe('segmentOffsetForChar', () => {
  // "aaaa\nbbbb\ncccc" → segments at offsets 0, 5, 10
  const segs = [
    { offset: 0, text: 'aaaa' },
    { offset: 5, text: 'bbbb' },
    { offset: 10, text: 'cccc' },
  ];
  it('finds the segment containing the offset', () => {
    expect(segmentOffsetForChar(segs, 2)).toBe(0);
    expect(segmentOffsetForChar(segs, 6)).toBe(5);
    expect(segmentOffsetForChar(segs, 12)).toBe(10);
  });
  it('clamps before the first and after the last segment', () => {
    expect(segmentOffsetForChar(segs, 0)).toBe(0);
    expect(segmentOffsetForChar(segs, 999)).toBe(10);
  });
  it('returns null for no segments', () => {
    expect(segmentOffsetForChar([], 5)).toBeNull();
  });
});
