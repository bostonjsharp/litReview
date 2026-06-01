import type { PaperMetadata } from '../llm/types-shared';
import { fetchCrossref } from './metadata';
import { contactEmail, userAgent } from './contact';

export type Identifier = { type: 'doi' | 'arxiv'; id: string };

// arXiv ids look like 2401.12345 or 2401.12345v2 (optionally with a version suffix).
// Only the modern YYMM.NNNNN scheme is supported (pre-2007 ids like hep-th/0503001
// are not recognized). A DOI with arXiv's 10.48550/arXiv.* prefix is intentionally
// routed through the arXiv branch — the arXiv API gives a reliable full-text PDF.
const ARXIV_ID_RE = /(\d{4}\.\d{4,5})(v\d+)?/;
// DOIs always start with 10. and contain a slash.
const DOI_RE = /10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i;

export function parseIdentifier(input: string): Identifier | null {
  const s = input.trim();

  // arXiv — match URLs (arxiv.org/abs/... or /pdf/...) and bare/prefixed ids first,
  // because an arXiv id never contains "10." so there is no ambiguity with DOIs.
  if (/arxiv/i.test(s) || /^(arxiv:)?\s*\d{4}\.\d{4,5}(v\d+)?$/i.test(s)) {
    const m = s.match(ARXIV_ID_RE);
    if (m) return { type: 'arxiv', id: m[1] };
  }

  // DOI — raw, doi: prefixed, or doi.org URL.
  const doi = s.match(DOI_RE);
  if (doi) return { type: 'doi', id: doi[0].replace(/[).,;]+$/, '') };

  return null;
}

// arXiv Atom encodes a few HTML entities in titles/abstracts; decode the common ones.
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// arXiv returns an Atom feed with a single <entry>. We extract the entry block
// first so the feed-level <title> ("ArXiv Query") is never mistaken for the paper.
export function parseArxivAtom(xml: string): PaperMetadata | null {
  const entry = xml.match(/<entry>([\s\S]*?)<\/entry>/)?.[1];
  if (!entry) return null;
  const md: PaperMetadata = {};
  const title = entry.match(/<title>([\s\S]*?)<\/title>/)?.[1];
  if (title) md.title = decodeEntities(title.replace(/\s+/g, ' ').trim());
  const authors = [...entry.matchAll(/<name>([\s\S]*?)<\/name>/g)].map((m) => m[1].trim()).filter(Boolean);
  if (authors.length) md.authors = authors;
  const year = entry.match(/<published>(\d{4})/)?.[1];
  if (year) md.year = Number(year);
  const summary = entry.match(/<summary>([\s\S]*?)<\/summary>/)?.[1];
  if (summary) md.abstract = decodeEntities(summary.replace(/\s+/g, ' ').trim());
  md.journal = 'arXiv';
  return md;
}

export interface ResolvedSource {
  metadata: PaperMetadata;
  pdfUrl: string | null;
  source: 'doi' | 'arxiv';
}

async function unpaywallPdfUrl(doi: string, fetchFn: typeof fetch): Promise<string | null> {
  const url = `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${encodeURIComponent(contactEmail())}`;
  const res = await fetchFn(url, { headers: { 'User-Agent': userAgent() } });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.best_oa_location?.url_for_pdf ?? null;
}

export async function resolveSource(
  id: Identifier,
  fetchFn: typeof fetch = fetch,
): Promise<ResolvedSource> {
  if (id.type === 'arxiv') {
    // Network errors propagate to the caller; only parse failures are silenced.
    const res = await fetchFn(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id.id)}`, {
      headers: { 'User-Agent': userAgent() },
    });
    const metadata = (res.ok ? parseArxivAtom(await res.text()) : null) ?? {};
    // Only hand back a PDF url when the paper was confirmed (metadata parsed).
    // arXiv PDF urls are deterministic, but a url without confirmed metadata would
    // mislead callers that treat pdfUrl as "paper exists".
    const pdfUrl = metadata.title ? `https://arxiv.org/pdf/${id.id}` : null;
    return { metadata, pdfUrl, source: 'arxiv' };
  }
  // DOI: CrossRef for metadata, Unpaywall for an open-access PDF (if any).
  const metadata = (await fetchCrossref(id.id, fetchFn).catch(() => null)) ?? { doi: id.id };
  const pdfUrl = await unpaywallPdfUrl(id.id, fetchFn).catch(() => null);
  return { metadata, pdfUrl, source: 'doi' };
}
