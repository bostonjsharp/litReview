import { describe, it, expect } from 'vitest';
import { reorder, compact } from '@/lib/reviews/entries';

describe('reorder', () => {
  const entries = [
    { id: 'a', position: 0 },
    { id: 'b', position: 1 },
    { id: 'c', position: 2 },
  ];
  it('moves an entry up by swapping positions with its predecessor', () => {
    expect(reorder(entries, 'b', 'up')).toEqual([
      { id: 'a', position: 1 },
      { id: 'b', position: 0 },
      { id: 'c', position: 2 },
    ]);
  });
  it('moves an entry down', () => {
    expect(reorder(entries, 'b', 'down')).toEqual([
      { id: 'a', position: 0 },
      { id: 'b', position: 2 },
      { id: 'c', position: 1 },
    ]);
  });
  it('is a no-op at the boundary', () => {
    expect(reorder(entries, 'a', 'up')).toEqual(entries);
    expect(reorder(entries, 'c', 'down')).toEqual(entries);
  });
});

describe('compact', () => {
  it('renumbers positions to 0..n-1 by current order', () => {
    expect(compact([
      { id: 'x', position: 5 },
      { id: 'y', position: 2 },
      { id: 'z', position: 9 },
    ])).toEqual([
      { id: 'y', position: 0 },
      { id: 'x', position: 1 },
      { id: 'z', position: 2 },
    ]);
  });
});
