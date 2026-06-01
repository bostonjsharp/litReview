export type Identifier = { type: 'doi' | 'arxiv'; id: string };

// arXiv ids look like 2401.12345 or 2401.12345v2 (optionally with a version suffix).
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
