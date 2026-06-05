import { describe, it, expect } from 'vitest';
import { reviewToMarkdown } from '@/lib/reviews/export';

const ann = { a1: { quote: 'Attention is key', page: 3, sourceLabel: 'Vaswani · 2017' } };

describe('reviewToMarkdown', () => {
  it('renders title, prose, and an annotation blockquote in position order', () => {
    const md = reviewToMarkdown(
      'My Review',
      [
        { position: 1, kind: 'annotation', prose: null, annotationId: 'a1' },
        { position: 0, kind: 'prose', prose: 'Opening thoughts.', annotationId: null },
      ],
      ann,
    );
    expect(md).toBe('# My Review\n\nOpening thoughts.\n\n> "Attention is key" — Vaswani · 2017 · p.3\n');
  });
  it('skips empty prose and unknown annotations; falls back to Untitled', () => {
    const md = reviewToMarkdown('  ', [
      { position: 0, kind: 'prose', prose: '   ', annotationId: null },
      { position: 1, kind: 'annotation', prose: null, annotationId: 'missing' },
    ], ann);
    expect(md).toBe('# Untitled review\n');
  });
  it('omits the page when null', () => {
    const md = reviewToMarkdown('T', [{ position: 0, kind: 'annotation', prose: null, annotationId: 'a1' }], { a1: { quote: 'q', page: null, sourceLabel: 'Src' } });
    expect(md).toBe('# T\n\n> "q" — Src\n');
  });
});
