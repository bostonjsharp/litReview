import { describe, it, expect } from 'vitest';
import { normalizeThemeName } from '@/lib/themes/name';

describe('normalizeThemeName', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeThemeName('  Attention  ')).toBe('Attention');
  });
  it('returns null for empty or whitespace-only input', () => {
    expect(normalizeThemeName('')).toBeNull();
    expect(normalizeThemeName('   ')).toBeNull();
  });
  it('keeps a valid single-character name', () => {
    expect(normalizeThemeName('A')).toBe('A');
  });
});
