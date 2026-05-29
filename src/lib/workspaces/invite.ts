import { randomBytes } from 'node:crypto';

// 9 random bytes → 12-char URL-safe base64 string.
export function generateInviteCode(): string {
  return randomBytes(9).toString('base64url');
}
