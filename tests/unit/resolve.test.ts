import { describe, it, expect } from 'vitest';
import { parseIdentifier, parseArxivAtom } from '@/lib/ingest/resolve';

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
});
