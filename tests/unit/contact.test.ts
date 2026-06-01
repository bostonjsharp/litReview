import { describe, it, expect, afterEach } from 'vitest';
import { contactEmail, userAgent } from '@/lib/ingest/contact';

afterEach(() => {
  delete process.env.UNPAYWALL_EMAIL;
});

describe('contactEmail', () => {
  it('uses UNPAYWALL_EMAIL when set', () => {
    process.env.UNPAYWALL_EMAIL = 'lab@uni.edu';
    expect(contactEmail()).toBe('lab@uni.edu');
  });
  it('falls back to a placeholder when unset', () => {
    expect(contactEmail()).toBe('team@example.edu');
  });
});

describe('userAgent', () => {
  it('embeds the contact email as a mailto', () => {
    process.env.UNPAYWALL_EMAIL = 'lab@uni.edu';
    expect(userAgent()).toBe('LitReview/1.0 (mailto:lab@uni.edu)');
  });
  it('uses the placeholder email when UNPAYWALL_EMAIL is unset', () => {
    expect(userAgent()).toBe('LitReview/1.0 (mailto:team@example.edu)');
  });
});
