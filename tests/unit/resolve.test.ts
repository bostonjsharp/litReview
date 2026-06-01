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
});
