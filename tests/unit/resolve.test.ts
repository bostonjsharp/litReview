import { describe, it, expect } from 'vitest';
import { parseIdentifier } from '@/lib/ingest/resolve';

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
