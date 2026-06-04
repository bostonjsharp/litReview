import { describe, it, expect } from 'vitest';
import { firstOccurrenceFlags } from '@/lib/annotate/highlights';

describe('firstOccurrenceFlags', () => {
  it('flags only the first appearance of each id, ignoring nulls', () => {
    const input = [null, 'a', 'a', null, 'b', 'a'];
    expect(firstOccurrenceFlags(input)).toEqual([false, true, false, false, true, false]);
  });
  it('returns all false for an empty or all-null list', () => {
    expect(firstOccurrenceFlags([])).toEqual([]);
    expect(firstOccurrenceFlags([null, null])).toEqual([false, false]);
  });
});
