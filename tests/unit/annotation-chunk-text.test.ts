import { describe, it, expect } from 'vitest';
import { annotationChunkText } from '@/lib/annotate/embed';

describe('annotationChunkText', () => {
  it('joins quote and comment with a newline', () => {
    expect(annotationChunkText('the quote', 'my note')).toBe('the quote\nmy note');
  });
  it('omits empty parts and trims', () => {
    expect(annotationChunkText('  ', 'only note')).toBe('only note');
    expect(annotationChunkText('only quote', '')).toBe('only quote');
  });
  it('returns empty string when both are blank', () => {
    expect(annotationChunkText('', '   ')).toBe('');
  });
});
