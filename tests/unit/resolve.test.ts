import { describe, it, expect, vi } from 'vitest';
import { parseIdentifier, parseArxivAtom, resolveSource } from '@/lib/ingest/resolve';

describe('parseIdentifier', () => {
  it('parses a raw DOI', () => {
    expect(parseIdentifier('10.1145/12345')).toEqual({ type: 'doi', id: '10.1145/12345' });
  });
  it('parses a doi: prefixed DOI', () => {
    expect(parseIdentifier('doi:10.1145/12345')).toEqual({ type: 'doi', id: '10.1145/12345' });
  });
  it('parses a doi.org URL', () => {
    expect(parseIdentifier('https://doi.org/10.1145/12345')).toEqual({ type: 'doi', id: '10.1145/12345' });
  });
  it('parses a raw arXiv id', () => {
    expect(parseIdentifier('2401.12345')).toEqual({ type: 'arxiv', id: '2401.12345' });
  });
  it('strips an arXiv version suffix and prefix', () => {
    expect(parseIdentifier('arXiv:2401.12345v2')).toEqual({ type: 'arxiv', id: '2401.12345' });
  });
  it('parses an arxiv.org abs URL', () => {
    expect(parseIdentifier('https://arxiv.org/abs/2401.12345')).toEqual({ type: 'arxiv', id: '2401.12345' });
  });
  it('parses an arxiv.org pdf URL', () => {
    expect(parseIdentifier('https://arxiv.org/pdf/2401.12345')).toEqual({ type: 'arxiv', id: '2401.12345' });
  });
  it('trims surrounding whitespace', () => {
    expect(parseIdentifier('  2401.12345  ')).toEqual({ type: 'arxiv', id: '2401.12345' });
  });
  it('returns null for unrecognized input', () => {
    expect(parseIdentifier('not an identifier')).toBeNull();
  });
  it('parses a 5-digit-mantissa arXiv id', () => {
    expect(parseIdentifier('2401.123456'.slice(0, 10))).toEqual({ type: 'arxiv', id: '2401.12345' });
  });
  it('handles a two-digit version suffix', () => {
    expect(parseIdentifier('arXiv:2401.12345v10')).toEqual({ type: 'arxiv', id: '2401.12345' });
  });
  it('routes an arXiv DOI prefix through the arXiv branch', () => {
    expect(parseIdentifier('10.48550/arXiv.2401.12345')).toEqual({ type: 'arxiv', id: '2401.12345' });
  });
  it('falls through to DOI when an arxiv-keyword url has no arXiv id', () => {
    expect(parseIdentifier('https://doi.org/10.5555/arxiv-proceedings.2023.1')).toEqual({
      type: 'doi',
      id: '10.5555/arxiv-proceedings.2023.1',
    });
  });
});

const ARXIV_XML = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>ArXiv Query</title>
  <entry>
    <title>Attention Is All You Need</title>
    <published>2017-06-12T00:00:00Z</published>
    <summary>  The dominant sequence transduction models
    are based on recurrent networks.  </summary>
    <author><name>Ashish Vaswani</name></author>
    <author><name>Noam Shazeer</name></author>
  </entry>
</feed>`;

describe('parseArxivAtom', () => {
  it('extracts title, authors, year, and abstract from the entry', () => {
    const md = parseArxivAtom(ARXIV_XML);
    expect(md?.title).toBe('Attention Is All You Need');
    expect(md?.authors).toEqual(['Ashish Vaswani', 'Noam Shazeer']);
    expect(md?.year).toBe(2017);
    expect(md?.abstract).toBe('The dominant sequence transduction models are based on recurrent networks.');
    expect(md?.journal).toBe('arXiv');
  });
  it('returns null when there is no entry', () => {
    expect(parseArxivAtom('<feed><title>ArXiv Query</title></feed>')).toBeNull();
  });
  it('decodes common HTML entities in title and abstract', () => {
    const xml = `<feed><entry><title>Cats &amp; Dogs &lt;v2&gt;</title><summary>A &quot;study&quot; of R&amp;D.</summary><published>2020-01-01T00:00:00Z</published></entry></feed>`;
    const md = parseArxivAtom(xml);
    expect(md?.title).toBe('Cats & Dogs <v2>');
    expect(md?.abstract).toBe('A "study" of R&D.');
  });
});

describe('resolveSource', () => {
  it('resolves an arXiv id to metadata and a pdf url', async () => {
    const fakeFetch = vi.fn(async () => ({ ok: true, text: async () => ARXIV_XML })) as unknown as typeof fetch;
    const r = await resolveSource({ type: 'arxiv', id: '1706.03762' }, fakeFetch);
    expect(r.source).toBe('arxiv');
    expect(r.metadata.title).toBe('Attention Is All You Need');
    expect(r.pdfUrl).toBe('https://arxiv.org/pdf/1706.03762');
  });

  it('returns empty metadata and null pdf url when the arXiv API fails', async () => {
    const fakeFetch = vi.fn(async () => ({ ok: false, status: 503, text: async () => '' })) as unknown as typeof fetch;
    const r = await resolveSource({ type: 'arxiv', id: '1706.03762' }, fakeFetch);
    expect(r.metadata.title).toBeUndefined();
    expect(r.pdfUrl).toBeNull();
  });

  it('resolves a DOI to CrossRef metadata and an Unpaywall pdf url', async () => {
    const fakeFetch = vi.fn(async (url: string) => {
      if (url.includes('crossref')) {
        return { ok: true, json: async () => ({ message: { title: ['A Paper'], DOI: '10.1/x' } }) };
      }
      if (url.includes('unpaywall')) {
        return { ok: true, json: async () => ({ best_oa_location: { url_for_pdf: 'https://oa.example/x.pdf' } }) };
      }
      throw new Error(`unexpected url ${url}`);
    }) as unknown as typeof fetch;
    const r = await resolveSource({ type: 'doi', id: '10.1/x' }, fakeFetch);
    expect(r.source).toBe('doi');
    expect(r.metadata.title).toBe('A Paper');
    expect(r.pdfUrl).toBe('https://oa.example/x.pdf');
  });

  it('returns a null pdf url when Unpaywall has no open-access location', async () => {
    const fakeFetch = vi.fn(async (url: string) => {
      if (url.includes('crossref')) return { ok: true, json: async () => ({ message: { title: ['T'], DOI: '10.1/y' } }) };
      return { ok: true, json: async () => ({ best_oa_location: null }) };
    }) as unknown as typeof fetch;
    const r = await resolveSource({ type: 'doi', id: '10.1/y' }, fakeFetch);
    expect(r.pdfUrl).toBeNull();
    expect(r.metadata.title).toBe('T');
  });
});
