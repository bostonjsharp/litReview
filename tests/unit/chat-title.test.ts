import { describe, it, expect } from 'vitest';
import { titleFromQuestion } from '@/lib/chat/title';

describe('titleFromQuestion', () => {
  it('returns "New chat" for empty/whitespace input', () => {
    expect(titleFromQuestion('')).toBe('New chat');
    expect(titleFromQuestion('   ')).toBe('New chat');
  });
  it('collapses whitespace and keeps short questions whole', () => {
    expect(titleFromQuestion('  What   are the   findings? ')).toBe('What are the findings?');
  });
  it('truncates long questions on a word boundary with an ellipsis', () => {
    const long = 'What are the most important methodological differences between these twelve studies on attention';
    const out = titleFromQuestion(long);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(61); // <=60 chars + ellipsis
    expect(out.startsWith('What are the most')).toBe(true);
  });
});
