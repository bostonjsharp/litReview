import { describe, it, expect, vi } from 'vitest';
import { findDoi, fetchCrossref, extractMetadata } from '@/lib/ingest/metadata';

describe('findDoi', () => {
  it('finds a DOI in text', () => {
    expect(findDoi('see doi:10.1234/abcd.5678 for details')).toBe('10.1234/abcd.5678');
  });
  it('returns null when absent', () => {
    expect(findDoi('no identifier here')).toBeNull();
  });
});

describe('fetchCrossref', () => {
  it('maps CrossRef JSON to PaperMetadata', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: {
        title: ['A Great Paper'],
        author: [{ given: 'Jane', family: 'Smith' }],
        'published-print': { 'date-parts': [[2020]] },
        'container-title': ['Journal of Things'],
        DOI: '10.1234/abcd',
      } }),
    }) as unknown as typeof fetch;
    const md = await fetchCrossref('10.1234/abcd', fakeFetch);
    expect(md).toEqual({ title: 'A Great Paper', authors: ['Jane Smith'], year: 2020, journal: 'Journal of Things', doi: '10.1234/abcd' });
  });
});

describe('extractMetadata', () => {
  it('uses CrossRef when a DOI is present', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: { title: ['T'], author: [], DOI: '10.1/x' } }),
    }) as unknown as typeof fetch;
    const llm = { embed: vi.fn(), chat: vi.fn() } as any;
    const md = await extractMetadata('doi:10.1234/x here', llm, fakeFetch);
    expect(md.title).toBe('T');
    expect(llm.chat).not.toHaveBeenCalled();
  });
});
