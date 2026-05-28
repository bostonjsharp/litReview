import { describe, it, expect } from 'vitest';
import { assembleMatrix } from '@/lib/themes/matrix';

describe('assembleMatrix', () => {
  const papers = [{ id: 'p1', title: 'A' }, { id: 'p2', title: 'B' }];
  const themes = [{ id: 't1', name: 'Method' }, { id: 't2', name: 'Result' }];

  it('places tagged annotations into the correct (paper, theme) cells', () => {
    const tagged = [
      { annotationId: 'a1', paperId: 'p1', themeId: 't1', quote: 'q1', comment: 'c1', page: 2 },
      { annotationId: 'a2', paperId: 'p1', themeId: 't1', quote: 'q2', comment: 'c2', page: 3 },
      { annotationId: 'a3', paperId: 'p2', themeId: 't2', quote: 'q3', comment: 'c3', page: null },
    ];
    const m = assembleMatrix(papers, themes, tagged);
    expect(m.papers).toBe(papers);
    expect(m.themes).toBe(themes);
    expect(m.cells['p1']['t1'].map((c) => c.id)).toEqual(['a1', 'a2']);
    expect(m.cells['p2']['t2']).toEqual([{ id: 'a3', quote: 'q3', comment: 'c3', page: null }]);
    expect(m.cells['p1']?.['t2']).toBeUndefined();
  });

  it('returns empty cells for no tags', () => {
    const m = assembleMatrix(papers, themes, []);
    expect(m.cells).toEqual({});
  });
});
