# Import papers by DOI / arXiv identifier

**Date:** 2026-06-01
**Status:** Approved design — ready for implementation plan

## Problem

Today a paper can only enter the system two ways: upload a PDF file, or paste its
full text. Both require the user to already have the document in hand. Researchers
usually have an *identifier* — a DOI or an arXiv ID — long before they have the PDF.

The system is built around having the paper's **full text**: it chunks and embeds
the body to power retrieval and chat. CrossRef (already integrated) returns only
*metadata*, never body text. So "import by identifier" only delivers real value if
it also fetches the full text when that's possible.

## Goal

Add a third way to attach a paper: paste a DOI or arXiv identifier (raw ID or URL),
preview the resolved metadata, and import it. Fetch the full-text PDF when available
so the paper is fully usable (chat/retrieval); fall back to a clearly-labeled
metadata-only stub when no open-access full text exists.

Scope is **papers only** — reviews are the user's own writing and have no identifier.

## Non-goals

- PubMed / PMID support (possible later).
- Generic "paste any paper URL" resolution / web scraping.
- Bulk import (BibTeX/RIS), reference-manager sync, or external database search.
- OCR of scanned PDFs (unchanged from today's behavior).

## Design

### 1. Identifier resolution — `src/lib/ingest/resolve.ts` (new)

A pure, injectable module (takes an optional `fetchFn`, mirroring the existing
`fetchCrossref`), so it is unit-testable without network access.

```ts
parseIdentifier(input: string): { type: 'doi' | 'arxiv'; id: string } | null
```

Normalizes any of the following to a clean ID, or returns `null` if unrecognized:

| Input | Result |
|-------|--------|
| `10.1145/12345`, `doi:10.1145/12345`, `https://doi.org/10.1145/12345` | `{ type: 'doi', id: '10.1145/12345' }` |
| `2401.12345`, `arXiv:2401.12345v2`, `https://arxiv.org/abs/2401.12345`, `https://arxiv.org/pdf/2401.12345` | `{ type: 'arxiv', id: '2401.12345' }` |

```ts
resolveSource(
  parsed: { type: 'doi' | 'arxiv'; id: string },
  fetchFn?: typeof fetch,
): Promise<{ metadata: PaperMetadata; pdfUrl: string | null; source: 'doi' | 'arxiv' }>
```

- **arXiv** → `https://export.arxiv.org/api/query?id_list=<id>` (Atom XML → title,
  authors, year, abstract). `pdfUrl = https://arxiv.org/pdf/<id>` — always set.
- **DOI** → reuse `fetchCrossref()` for metadata; then
  `https://api.unpaywall.org/v2/<doi>?email=<UNPAYWALL_EMAIL>` →
  `pdfUrl = best_oa_location.url_for_pdf ?? null`.

All outbound calls send a descriptive `User-Agent` (the same convention the existing
CrossRef call uses).

### 2. Routes + data flow

**`POST /api/lookup`** — preview, synchronous, JSON body `{ identifier }`:

1. `requireUser` (401 if absent).
2. `parseIdentifier` → 400 if unrecognized.
3. `resolveSource`.
4. Return `{ metadata, fullTextAvailable: !!pdfUrl, source }`.

No DB write, no PDF download — fast.

**`POST /api/import`** — confirm, JSON body `{ identifier, workspaceId, collectionId? }`:

1. `requireUser` + `requireMember(workspaceId)` (401 / 403).
2. **Re-resolve server-side** — the client's previewed metadata is never trusted.
3. Insert a `papers` row with `status: 'pending'`, seeding `title` / `doi` from the
   resolved metadata.
4. `after(...)`:
   - **PDF available** → download bytes, then
     `processDocument({ parentType: 'paper', parentId, bytes, metadata }, deps)`.
   - **No PDF** → write the resolved metadata fields directly with
     `status: 'metadata_only'`; skip chunking/embedding.
5. Return `{ id, status: 'pending' }` (202), matching `/api/upload`.

**Pipeline change** — `processDocument` (`src/lib/ingest/pipeline.ts`) gains an
optional `metadata?: PaperMetadata` field on its input. When present, it is written
directly and the `extractMetadata()` LLM call is **skipped** — cheaper, and
authoritative arXiv/CrossRef metadata beats an LLM guess. Chunking and embedding are
unchanged. When absent (today's file/paste paths), behavior is exactly as before.

### 3. Status & error handling

- Add `'metadata_only'` to `statusValues` in `src/db/schema.ts`. The `status` column
  is `text`, so this is a non-destructive enum widening with **no data migration**.
- Add `metadata_only` to the `StatusBadge` map (label "Metadata only", muted style).
- A `metadata_only` paper has no chunks, so it is naturally invisible to
  retrieval/chat — **no query changes needed**. The badge plus a short inline note
  ("No full text — upload the PDF to enable chat") tells the user what's missing.
- Surfaced failure modes:
  - Unrecognized identifier → `/api/lookup` returns 400 with a clear message.
  - Resolver network / API failure → "Couldn't reach arXiv/CrossRef — try again."
  - PDF download fails during `/api/import` processing → paper lands as `failed` with
    `errorReason`; the existing retry path applies.

### 4. UI — `src/components/UploadForm.tsx`

- Replace the `pasteMode: boolean` state with `mode: 'file' | 'paste' | 'lookup'`.
- The lookup affordance appears **only when `kind === 'paper'`** — a second ghost
  button beside "Paste text instead": **"Import by DOI / arXiv"**.
- Lookup panel: one text input + **Look up** button → `POST /api/lookup` → renders a
  small **preview card** (title, authors, year, and a "Full text available ✓" /
  "Metadata only — no full text" line) with **Import** / **Cancel** actions.
- **Import** → `POST /api/import`, then push the returned item into the existing
  **Recent imports** queue. That queue already polls `/api/papers/[id]` and renders
  `StatusBadge`, so `processing → ready` (or `metadata_only`) appears with no extra
  wiring.

### 5. Configuration

- New env var **`UNPAYWALL_EMAIL`** — a single project/admin contact address sent as
  the required `email` param on every Unpaywall request (Unpaywall has no API keys;
  the email is its rate-limit "polite pool" mechanism). Not an end-user email, not
  sent anywhere except Unpaywall.
- Replace the hardcoded `team@example.edu` placeholder in the existing CrossRef
  `User-Agent` (`src/lib/ingest/metadata.ts`) with the same configurable contact, so
  both polite-pool contacts come from one place.

## Testing

- **`parseIdentifier`** — unit tests across all accepted DOI/arXiv forms (raw, `doi:`,
  URLs, arXiv version suffix) plus rejection of garbage input.
- **`resolveSource`** — unit tests with a stubbed `fetchFn` for: arXiv success,
  DOI with Unpaywall full text, DOI metadata-only (Unpaywall returns no OA location),
  and upstream failure.
- **`processDocument`** — verify the pre-fetched-`metadata` path skips the LLM call
  and that an empty/no-PDF import produces a `metadata_only` stub rather than `failed`.
- **Routes** — `/api/lookup` (200 / 400 / 401) and `/api/import` (202 / 401 / 403,
  full-text vs metadata-only branches) with the resolver mocked.

## Touched files

| File | Change |
|------|--------|
| `src/lib/ingest/resolve.ts` | **new** — `parseIdentifier`, `resolveSource` |
| `src/app/api/lookup/route.ts` | **new** — preview endpoint |
| `src/app/api/import/route.ts` | **new** — confirm/import endpoint |
| `src/lib/ingest/pipeline.ts` | optional `metadata` input; skip LLM extraction when provided |
| `src/lib/ingest/metadata.ts` | CrossRef `User-Agent` email from env |
| `src/db/schema.ts` | add `'metadata_only'` to `statusValues` |
| `src/components/ui/StatusBadge.tsx` | add `metadata_only` badge |
| `src/components/UploadForm.tsx` | `mode` state + lookup panel + preview card |
| `.env` / env docs | `UNPAYWALL_EMAIL` |
