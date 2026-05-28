import { describe, it, expect } from 'vitest';
import { isAllowed } from '@/lib/allowlist';

describe('isAllowed', () => {
  it('allows emails on the list (case-insensitive)', () => {
    expect(isAllowed('Prof@Example.edu', 'prof@example.edu,fellow@example.edu')).toBe(true);
  });
  it('rejects emails not on the list', () => {
    expect(isAllowed('stranger@evil.com', 'prof@example.edu')).toBe(false);
  });
  it('rejects when email is missing', () => {
    expect(isAllowed(undefined, 'prof@example.edu')).toBe(false);
  });
});
