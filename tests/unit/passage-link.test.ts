import { describe, it, expect } from 'vitest';
import { passageHref } from '@/lib/ui/passage-link';

describe('passageHref', () => {
  it('links a paper passage with ?at=', () => {
    expect(passageHref('w', { parentType: 'paper', parentId: 'p1', paperId: 'p1', charStart: 42 }))
      .toBe('/workspaces/w/papers/p1?at=42');
  });
  it('links a note to its paper with ?ann=', () => {
    expect(passageHref('w', { parentType: 'annotation', parentId: 'a1', paperId: 'p2', charStart: 0 }))
      .toBe('/workspaces/w/papers/p2?ann=a1');
  });
  it('returns undefined for a note with no paper', () => {
    expect(passageHref('w', { parentType: 'annotation', parentId: 'a1', paperId: null, charStart: 0 }))
      .toBeUndefined();
  });
  it('links a review to its edit page', () => {
    expect(passageHref('w', { parentType: 'review', parentId: 'r1', paperId: null, charStart: 0 }))
      .toBe('/workspaces/w/reviews/r1/edit');
  });
});
