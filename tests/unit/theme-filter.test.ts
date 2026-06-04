import { describe, it, expect } from 'vitest';
import { matchesThemeFocus, isDimmed } from '@/lib/annotate/themeFilter';

const tags = { a1: ['t1', 't2'], a2: ['t2'], a3: [] as string[] };

describe('matchesThemeFocus', () => {
  it('matches everything when no theme is focused', () => {
    expect(matchesThemeFocus('a3', null, tags)).toBe(true);
  });
  it('matches a highlight tagged with the focused theme', () => {
    expect(matchesThemeFocus('a1', 't2', tags)).toBe(true);
    expect(matchesThemeFocus('a2', 't2', tags)).toBe(true);
  });
  it('does not match a highlight lacking the focused theme', () => {
    expect(matchesThemeFocus('a2', 't1', tags)).toBe(false);
    expect(matchesThemeFocus('a3', 't1', tags)).toBe(false);
  });
  it('treats an unknown annotation as no tags', () => {
    expect(matchesThemeFocus('zzz', 't1', tags)).toBe(false);
  });
});

describe('isDimmed', () => {
  it('dims nothing when no theme is focused', () => {
    expect(isDimmed('a2', null, tags)).toBe(false);
  });
  it('dims a highlight that lacks the focused theme', () => {
    expect(isDimmed('a2', 't1', tags)).toBe(true);
  });
  it('does not dim a highlight that has the focused theme', () => {
    expect(isDimmed('a1', 't1', tags)).toBe(false);
  });
});
