import { describe, it, expect } from 'vitest';
import { generateInviteCode } from '@/lib/workspaces/invite';
import { canRemoveMember } from '@/lib/workspaces/guard';

describe('generateInviteCode', () => {
  it('returns a URL-safe code and is non-repeating', () => {
    const a = generateInviteCode();
    const b = generateInviteCode();
    expect(a).toMatch(/^[A-Za-z0-9_-]{12,}$/);
    expect(a).not.toBe(b);
  });
});

describe('canRemoveMember', () => {
  const members = [
    { userId: 'u1', role: 'owner' as const },
    { userId: 'u2', role: 'member' as const },
  ];
  it('allows removing a non-last-owner member', () => {
    expect(canRemoveMember(members, 'u2')).toBe(true);
  });
  it('blocks removing the only owner', () => {
    expect(canRemoveMember(members, 'u1')).toBe(false);
  });
  it('allows removing an owner when another owner remains', () => {
    const two = [{ userId: 'u1', role: 'owner' as const }, { userId: 'u3', role: 'owner' as const }];
    expect(canRemoveMember(two, 'u1')).toBe(true);
  });
});
