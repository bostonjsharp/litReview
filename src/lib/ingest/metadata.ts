import type { LLMProvider } from '../llm/types';
import type { PaperMetadata } from '../llm/types-shared';

import { userAgent } from './contact';

const DOI_RE = /10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i;
const ARXIV_RE = /arXiv:\s*(\d{4}\.\d{4,5})(v\d+)?/i;

export function findDoi(text: string): string | null {
  const m = text.match(DOI_RE);
  return m ? m[0].replace(/[).,;]+$/, '') : null;
}

export function findArxivId(text: string): string | null {
  const m = text.match(ARXIV_RE);
  return m ? m[1] : null;
}

export async function fetchCrossref(doi: string, fetchFn: typeof fetch = fetch): Promise<PaperMetadata | null> {
  const res = await fetchFn(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
    headers: { 'User-Agent': userAgent() },
  });
  if (!res.ok) return null;
  const { message } = await res.json();
  const md: PaperMetadata = {};
  if (message.title?.[0]) md.title = message.title[0];
  if (Array.isArray(message.author)) {
    md.authors = message.author
      .map((a: { given?: string; family?: string }) => [a.given, a.family].filter(Boolean).join(' '))
      .filter(Boolean);
  }
  const year =
    message['published-print']?.['date-parts']?.[0]?.[0] ??
    message['published-online']?.['date-parts']?.[0]?.[0];
  if (year) md.year = year;
  if (message['container-title']?.[0]) md.journal = message['container-title'][0];
  if (message.DOI) md.doi = message.DOI;
  return md;
}

export async function extractMetadata(
  text: string,
  llm: LLMProvider,
  fetchFn: typeof fetch = fetch,
): Promise<PaperMetadata> {
  const doi = findDoi(text);
  if (doi) {
    const md = await fetchCrossref(doi, fetchFn).catch(() => null);
    if (md?.title) return md;
  }
  // LLM fallback: extract from the first ~2000 chars (title page region).
  const result = await llm.chat(
    [
      {
        role: 'user',
        content: `Extract bibliographic metadata from this text as JSON {title, authors[], year, journal}. Text:\n${text.slice(0, 2000)}`,
      },
    ],
    [],
  );
  try {
    const parsed = JSON.parse(result.answer) as PaperMetadata;
    return { ...parsed, ...(doi ? { doi } : {}) };
  } catch {
    return doi ? { doi } : {};
  }
}
