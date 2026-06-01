# DOI / arXiv Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user attach a paper by pasting a DOI or arXiv identifier — preview the resolved metadata, then import it, fetching the full-text PDF when one is openly available and falling back to a clearly-labeled metadata-only stub otherwise.

**Architecture:** A pure resolver module (`resolve.ts`) parses identifiers and fetches metadata + an open-access PDF URL from arXiv / CrossRef / Unpaywall. Two thin JSON routes wrap it: `/api/lookup` (preview, no writes) and `/api/import` (re-resolves server-side, then either runs the *existing* ingest pipeline on the downloaded PDF or writes a metadata-only stub). Testable library functions hold the logic; routes stay thin and untested, matching the codebase's existing pattern (e.g. `processDocument` is tested, `/api/upload` is not).

**Tech Stack:** Next.js 16 route handlers, Drizzle ORM (Postgres/Neon), Vitest, Zod, React 19 client component. External APIs: arXiv Atom API, CrossRef, Unpaywall.

---

## Conventions & ground rules (read first)

- **Tests live in `tests/`**, not beside source. Unit tests → `tests/unit/*.test.ts`; DB-backed tests → `tests/integration/*.test.ts`. Run with `npm test` (`vitest run`) or a single file with `npx vitest run tests/unit/<file>.test.ts`.
- Integration tests need `TEST_DATABASE_URL` set (a Neon DB separate from `DATABASE_URL`). They call `makeTestDb()` which resets the schema and applies `./drizzle` migrations.
- **`status` is a `text` column** with a TypeScript-only enum (`text('status', { enum: statusValues })`). Drizzle does **not** emit a DB `CHECK` constraint for it, so adding a new value to `statusValues` needs **no SQL migration**.
- **Git:** this workspace is **not** currently a git repo. The "Commit" steps below assume git; if `git status` errors, either run `git init` first or skip the commit steps. Either way, complete each task's test steps before moving on.
- Match existing style: 2-space indent, no semicolon-free style (semicolons are used), `import type` for type-only imports, injectable `fetchFn: typeof fetch = fetch` for anything that hits the network (see `fetchCrossref` in `src/lib/ingest/metadata.ts`).

---

## File structure

| File | Responsibility |
|------|----------------|
| `src/lib/ingest/contact.ts` | **new** — single source of the polite-pool contact email + User-Agent string |
| `src/lib/ingest/resolve.ts` | **new** — `parseIdentifier`, `parseArxivAtom`, `resolveSource` |
| `src/lib/ingest/import-source.ts` | **new** — `createImportedPaper` (insert + stub), `processImportedPdf` (download → blob → pipeline) |
| `src/lib/ingest/metadata.ts` | modify — use `contact.ts` for the CrossRef User-Agent |
| `src/lib/ingest/pipeline.ts` | modify — accept optional pre-fetched `metadata`, skip LLM extraction when present |
| `src/db/schema.ts` | modify — add `'metadata_only'` to `statusValues` |
| `src/components/ui/StatusBadge.tsx` | modify — add `metadata_only` badge |
| `src/app/api/lookup/route.ts` | **new** — preview endpoint |
| `src/app/api/import/route.ts` | **new** — confirm/import endpoint |
| `src/components/UploadForm.tsx` | modify — `mode` state, lookup panel, preview card |

---

## Task 1: Contact email / User-Agent helper

**Files:**
- Create: `src/lib/ingest/contact.ts`
- Test: `tests/unit/contact.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/contact.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { contactEmail, userAgent } from '@/lib/ingest/contact';

afterEach(() => {
  delete process.env.UNPAYWALL_EMAIL;
});

describe('contactEmail', () => {
  it('uses UNPAYWALL_EMAIL when set', () => {
    process.env.UNPAYWALL_EMAIL = 'lab@uni.edu';
    expect(contactEmail()).toBe('lab@uni.edu');
  });
  it('falls back to a placeholder when unset', () => {
    expect(contactEmail()).toBe('team@example.edu');
  });
});

describe('userAgent', () => {
  it('embeds the contact email as a mailto', () => {
    process.env.UNPAYWALL_EMAIL = 'lab@uni.edu';
    expect(userAgent()).toBe('LitReview/1.0 (mailto:lab@uni.edu)');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/contact.test.ts`
Expected: FAIL — cannot resolve module `@/lib/ingest/contact`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/ingest/contact.ts

// Single source of the "polite pool" contact address shared by every external
// bibliographic API call (CrossRef, Unpaywall, arXiv). These APIs are keyless;
// they ask for a contact email so they can reach a heavy user before rate-limiting.
// This is the APP's contact address (set via UNPAYWALL_EMAIL), never an end user's.
export function contactEmail(): string {
  return process.env.UNPAYWALL_EMAIL || 'team@example.edu';
}

export function userAgent(): string {
  return `LitReview/1.0 (mailto:${contactEmail()})`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/contact.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ingest/contact.ts tests/unit/contact.test.ts
git commit -m "feat: add shared contact email/User-Agent helper"
```

---

## Task 2: Route the existing CrossRef call through the helper

**Files:**
- Modify: `src/lib/ingest/metadata.ts:18-19`

- [ ] **Step 1: Update the import and User-Agent**

In `src/lib/ingest/metadata.ts`, add the import at the top (after the existing `import type` lines):

```ts
import { userAgent } from './contact';
```

Then change the `fetchCrossref` header from the hardcoded string:

```ts
  const res = await fetchFn(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
    headers: { 'User-Agent': userAgent() },
  });
```

- [ ] **Step 2: Run the existing metadata tests to verify no regression**

Run: `npx vitest run tests/unit/metadata.test.ts`
Expected: PASS (existing tests still green — they pass a fake `fetchFn`, so the header value is irrelevant to them).

- [ ] **Step 3: Commit**

```bash
git add src/lib/ingest/metadata.ts
git commit -m "refactor: source CrossRef User-Agent from contact helper"
```

---

## Task 3: `parseIdentifier`

**Files:**
- Create: `src/lib/ingest/resolve.ts`
- Test: `tests/unit/resolve.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/resolve.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/resolve.test.ts`
Expected: FAIL — cannot resolve module `@/lib/ingest/resolve`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/ingest/resolve.ts
import type { PaperMetadata } from '../llm/types-shared';
import { fetchCrossref } from './metadata';
import { contactEmail, userAgent } from './contact';

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/resolve.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ingest/resolve.ts tests/unit/resolve.test.ts
git commit -m "feat: parse DOI/arXiv identifiers from raw ids and URLs"
```

---

## Task 4: `parseArxivAtom` (arXiv Atom XML → metadata)

**Files:**
- Modify: `src/lib/ingest/resolve.ts`
- Test: `tests/unit/resolve.test.ts`

- [ ] **Step 1: Add the failing test**

Append to `tests/unit/resolve.test.ts`, and update the import line at the top to:

```ts
import { parseIdentifier, parseArxivAtom } from '@/lib/ingest/resolve';
```

Add this block:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/resolve.test.ts`
Expected: FAIL — `parseArxivAtom` is not exported.

- [ ] **Step 3: Write the implementation**

Add to `src/lib/ingest/resolve.ts`:

```ts
// arXiv returns an Atom feed with a single <entry>. We extract the entry block
// first so the feed-level <title> ("ArXiv Query") is never mistaken for the paper.
export function parseArxivAtom(xml: string): PaperMetadata | null {
  const entry = xml.match(/<entry>([\s\S]*?)<\/entry>/)?.[1];
  if (!entry) return null;
  const md: PaperMetadata = {};
  const title = entry.match(/<title>([\s\S]*?)<\/title>/)?.[1];
  if (title) md.title = title.replace(/\s+/g, ' ').trim();
  const authors = [...entry.matchAll(/<name>([\s\S]*?)<\/name>/g)].map((m) => m[1].trim()).filter(Boolean);
  if (authors.length) md.authors = authors;
  const year = entry.match(/<published>(\d{4})/)?.[1];
  if (year) md.year = Number(year);
  const summary = entry.match(/<summary>([\s\S]*?)<\/summary>/)?.[1];
  if (summary) md.abstract = summary.replace(/\s+/g, ' ').trim();
  md.journal = 'arXiv';
  return md;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/resolve.test.ts`
Expected: PASS (11 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ingest/resolve.ts tests/unit/resolve.test.ts
git commit -m "feat: parse arXiv Atom metadata"
```

---

## Task 5: `resolveSource` (arXiv + DOI/Unpaywall)

**Files:**
- Modify: `src/lib/ingest/resolve.ts`
- Test: `tests/unit/resolve.test.ts`

- [ ] **Step 1: Add the failing tests**

Update the import at the top of `tests/unit/resolve.test.ts` to add `resolveSource` and `vi`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { parseIdentifier, parseArxivAtom, resolveSource } from '@/lib/ingest/resolve';
```

Append:

```ts
describe('resolveSource', () => {
  it('resolves an arXiv id to metadata and a pdf url', async () => {
    const fakeFetch = vi.fn(async () => ({ ok: true, text: async () => ARXIV_XML })) as unknown as typeof fetch;
    const r = await resolveSource({ type: 'arxiv', id: '1706.03762' }, fakeFetch);
    expect(r.source).toBe('arxiv');
    expect(r.metadata.title).toBe('Attention Is All You Need');
    expect(r.pdfUrl).toBe('https://arxiv.org/pdf/1706.03762');
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/resolve.test.ts`
Expected: FAIL — `resolveSource` is not exported.

- [ ] **Step 3: Write the implementation**

Add to `src/lib/ingest/resolve.ts`:

```ts
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
    const res = await fetchFn(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id.id)}`, {
      headers: { 'User-Agent': userAgent() },
    });
    const metadata = (res.ok ? parseArxivAtom(await res.text()) : null) ?? {};
    return { metadata, pdfUrl: `https://arxiv.org/pdf/${id.id}`, source: 'arxiv' };
  }
  // DOI: CrossRef for metadata, Unpaywall for an open-access PDF (if any).
  const metadata = (await fetchCrossref(id.id, fetchFn).catch(() => null)) ?? { doi: id.id };
  const pdfUrl = await unpaywallPdfUrl(id.id, fetchFn).catch(() => null);
  return { metadata, pdfUrl, source: 'doi' };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/resolve.test.ts`
Expected: PASS (14 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ingest/resolve.ts tests/unit/resolve.test.ts
git commit -m "feat: resolve arXiv/DOI identifiers to metadata + open-access PDF url"
```

---

## Task 6: Pipeline accepts pre-fetched metadata

**Files:**
- Modify: `src/lib/ingest/pipeline.ts:7-12` (ProcessInput) and `:41-56` (paper branch)
- Test: `tests/integration/pipeline.test.ts`

- [ ] **Step 1: Add the failing test**

Append a new test to the `describe('processDocument', ...)` block in `tests/integration/pipeline.test.ts`:

```ts
  it('uses pre-fetched metadata and skips the LLM extraction call', async () => {
    const [p] = await ctx.db.insert(ctx.schema.papers).values({ status: 'pending' }).returning();
    const llm = fakeLLM();
    await processDocument(
      {
        parentType: 'paper',
        parentId: p.id,
        pastedText: 'Body text with no DOI present. '.repeat(200),
        metadata: { title: 'Injected Title', authors: ['Given Author'], year: 2019, journal: 'arXiv' },
      },
      { db: ctx.db, schema: ctx.schema, llm },
    );
    const [updated] = await ctx.db.select().from(ctx.schema.papers).where(eq(ctx.schema.papers.id, p.id));
    expect(updated.status).toBe('ready');
    expect(updated.title).toBe('Injected Title');
    expect(updated.authors).toEqual(['Given Author']);
    // extractMetadata's LLM fallback must NOT run when metadata is supplied.
    expect(llm.chat).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/pipeline.test.ts`
Expected: FAIL — `metadata` is not an accepted input field, so the title stays null (and/or `llm.chat` is called). (Requires `TEST_DATABASE_URL`.)

- [ ] **Step 3: Update `ProcessInput`**

In `src/lib/ingest/pipeline.ts`, add the import near the top:

```ts
import type { PaperMetadata } from '../llm/types-shared';
```

Extend the interface:

```ts
interface ProcessInput {
  parentType: ParentType;
  parentId: string;
  bytes?: Uint8Array;
  pastedText?: string;
  metadata?: PaperMetadata;
}
```

- [ ] **Step 4: Use the supplied metadata in the paper branch**

Replace the line that calls `extractMetadata` (currently line 42) with:

```ts
      const md = input.metadata
        ? input.metadata
        : await extractMetadata(text, llm).catch(() => ({}) as Awaited<ReturnType<typeof extractMetadata>>);
```

(The existing `db.update(...).set({ ... })` block below it is unchanged — it already reads `md.title`, `md.authors`, etc.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/integration/pipeline.test.ts`
Expected: PASS (3 tests — the original 2 plus the new one).

- [ ] **Step 6: Commit**

```bash
git add src/lib/ingest/pipeline.ts tests/integration/pipeline.test.ts
git commit -m "feat: let processDocument accept pre-fetched metadata"
```

---

## Task 7: Add the `metadata_only` status

**Files:**
- Modify: `src/db/schema.ts:3`
- Modify: `src/components/ui/StatusBadge.tsx:1-6`

- [ ] **Step 1: Widen the status enum**

In `src/db/schema.ts`, change line 3:

```ts
export const statusValues = ['pending', 'processing', 'ready', 'failed', 'metadata_only'] as const;
```

- [ ] **Step 2: Add the badge mapping**

In `src/components/ui/StatusBadge.tsx`, add an entry to `MAP`:

```ts
const MAP: Record<string, [string, string]> = {
  ready: ["badge-ready", "Ready"],
  processing: ["badge-processing", "Processing"],
  pending: ["badge-pending", "Pending"],
  failed: ["badge-failed", "Failed"],
  metadata_only: ["badge-pending", "Metadata only"],
};
```

(Reuses the existing muted `badge-pending` style class — no new CSS required.)

- [ ] **Step 3: Verify the project still type-checks and the unit suite is green**

Run: `npm run lint` then `npx vitest run tests/unit/resolve.test.ts tests/unit/contact.test.ts`
Expected: lint passes; tests PASS. (No DB migration needed — `status` is a `text` column with a TS-only enum.)

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.ts src/components/ui/StatusBadge.tsx
git commit -m "feat: add metadata_only paper status + badge"
```

---

## Task 8: Import library — `createImportedPaper` + `processImportedPdf`

**Files:**
- Create: `src/lib/ingest/import-source.ts`
- Test: `tests/integration/import-source.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/integration/import-source.test.ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { makeTestDb } from '../helpers/testdb';
import { createImportedPaper, processImportedPdf } from '@/lib/ingest/import-source';

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => {
  ctx = await makeTestDb();
});
afterAll(async () => {
  await ctx.sql.end();
});

function fakeLLM() {
  return {
    embed: vi.fn(async (texts: string[]) => texts.map(() => Array(1536).fill(0.01))),
    chat: vi.fn(async () => ({ answer: '{}', citations: [] })),
    complete: vi.fn(async () => '{}'),
  };
}

async function samplePdfBytes(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([300, 200]);
  page.drawText('Transformers outperform RNNs on long sequences.', { x: 20, y: 150, size: 10, font });
  return doc.save();
}

describe('createImportedPaper', () => {
  it('writes a metadata_only stub when there is no pdf url', async () => {
    const { id, status } = await createImportedPaper(
      {
        workspaceId: null,
        collectionId: null,
        userId: null,
        metadata: { title: 'Stub Paper', authors: ['A. Author'], year: 2021, journal: 'arXiv' },
        pdfUrl: null,
      },
      { db: ctx.db, schema: ctx.schema },
    );
    expect(status).toBe('metadata_only');
    const [row] = await ctx.db.select().from(ctx.schema.papers).where(eq(ctx.schema.papers.id, id));
    expect(row.status).toBe('metadata_only');
    expect(row.title).toBe('Stub Paper');
    expect(row.authors).toEqual(['A. Author']);
    expect(row.year).toBe(2021);
  });

  it('inserts a pending row when a pdf url is available', async () => {
    const { id, status } = await createImportedPaper(
      {
        workspaceId: null,
        collectionId: null,
        userId: null,
        metadata: { title: 'Full Text Paper', doi: '10.1/z' },
        pdfUrl: 'https://oa.example/z.pdf',
      },
      { db: ctx.db, schema: ctx.schema },
    );
    expect(status).toBe('pending');
    const [row] = await ctx.db.select().from(ctx.schema.papers).where(eq(ctx.schema.papers.id, id));
    expect(row.status).toBe('pending');
    expect(row.title).toBe('Full Text Paper');
    expect(row.doi).toBe('10.1/z');
  });
});

describe('processImportedPdf', () => {
  it('downloads, stores to blob, ingests, and marks ready using injected metadata', async () => {
    const [p] = await ctx.db.insert(ctx.schema.papers).values({ status: 'pending' }).returning();
    const bytes = await samplePdfBytes();
    const fetchFn = vi.fn(async () => ({ ok: true, arrayBuffer: async () => bytes.buffer })) as unknown as typeof fetch;
    const uploadPdf = vi.fn(async () => 'https://blob.example/stored.pdf');
    const llm = fakeLLM();

    await processImportedPdf(
      p.id,
      'https://oa.example/z.pdf',
      { title: 'Injected Title', authors: ['Z. Writer'] },
      { db: ctx.db, schema: ctx.schema, llm, fetchFn, uploadPdf },
    );

    const [row] = await ctx.db.select().from(ctx.schema.papers).where(eq(ctx.schema.papers.id, p.id));
    expect(row.status).toBe('ready');
    expect(row.pdfUrl).toBe('https://blob.example/stored.pdf');
    expect(row.title).toBe('Injected Title');
    expect(row.fullText).toContain('Transformers');
    expect(uploadPdf).toHaveBeenCalled();
    expect(llm.chat).not.toHaveBeenCalled(); // metadata injected, not extracted
  });

  it('marks the paper failed when the pdf download fails', async () => {
    const [p] = await ctx.db.insert(ctx.schema.papers).values({ status: 'pending' }).returning();
    const fetchFn = vi.fn(async () => ({ ok: false, status: 404 })) as unknown as typeof fetch;
    await processImportedPdf(
      p.id,
      'https://oa.example/missing.pdf',
      { title: 'X' },
      { db: ctx.db, schema: ctx.schema, llm: fakeLLM(), fetchFn, uploadPdf: vi.fn() },
    );
    const [row] = await ctx.db.select().from(ctx.schema.papers).where(eq(ctx.schema.papers.id, p.id));
    expect(row.status).toBe('failed');
    expect(row.errorReason).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/import-source.test.ts`
Expected: FAIL — cannot resolve module `@/lib/ingest/import-source`. (Requires `TEST_DATABASE_URL`.)

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/ingest/import-source.ts
import { eq } from 'drizzle-orm';
import { uploadPdf as defaultUploadPdf } from '../blob';
import { processDocument } from './pipeline';
import type { PaperMetadata } from '../llm/types-shared';
import type { LLMProvider } from '../llm/types';

interface CreateInput {
  workspaceId: string | null;
  collectionId: string | null;
  userId: string | null;
  metadata: PaperMetadata;
  pdfUrl: string | null;
}

interface CreateDeps {
  db: any;
  schema: any;
}

// Inserts the paper row. With no open-access PDF, the row is finalized as a
// metadata_only stub (it has no body text, so it is invisible to retrieval/chat).
// With a PDF, the row is left 'pending' for processImportedPdf to ingest in the
// background.
export async function createImportedPaper(
  input: CreateInput,
  deps: CreateDeps,
): Promise<{ id: string; status: 'pending' | 'metadata_only' }> {
  const { db, schema } = deps;
  const { metadata, pdfUrl } = input;
  const [row] = await db
    .insert(schema.papers)
    .values({
      collectionId: input.collectionId,
      workspaceId: input.workspaceId,
      title: metadata.title ?? null,
      doi: metadata.doi ?? null,
      status: 'pending',
      uploadedBy: input.userId,
    })
    .returning();

  if (pdfUrl) return { id: row.id, status: 'pending' };

  await db
    .update(schema.papers)
    .set({
      authors: metadata.authors ?? null,
      year: metadata.year ?? null,
      journal: metadata.journal ?? null,
      abstract: metadata.abstract ?? null,
      metadata,
      status: 'metadata_only',
    })
    .where(eq(schema.papers.id, row.id));

  return { id: row.id, status: 'metadata_only' };
}

interface ProcessDeps {
  db: any;
  schema: any;
  llm: LLMProvider;
  fetchFn?: typeof fetch;
  uploadPdf?: (filename: string, bytes: Uint8Array) => Promise<string>;
}

// Downloads the open-access PDF, stores it to blob (so the in-app viewer works the
// same as an uploaded file), then runs the standard ingest pipeline with the
// already-resolved metadata. On download failure the paper is marked failed.
export async function processImportedPdf(
  paperId: string,
  pdfUrl: string,
  metadata: PaperMetadata,
  deps: ProcessDeps,
): Promise<void> {
  const { db, schema, llm } = deps;
  const fetchFn = deps.fetchFn ?? fetch;
  const uploadPdf = deps.uploadPdf ?? defaultUploadPdf;
  try {
    const res = await fetchFn(pdfUrl, { headers: { 'User-Agent': 'LitReview/1.0' } });
    if (!res.ok) throw new Error(`PDF download failed (${res.status})`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const blobUrl = await uploadPdf(`${paperId}.pdf`, bytes);
    await db.update(schema.papers).set({ pdfUrl: blobUrl }).where(eq(schema.papers.id, paperId));
    await processDocument({ parentType: 'paper', parentId: paperId, bytes, metadata }, { db, schema, llm });
  } catch (err) {
    await db
      .update(schema.papers)
      .set({ status: 'failed', errorReason: (err as Error).message })
      .where(eq(schema.papers.id, paperId));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/integration/import-source.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ingest/import-source.ts tests/integration/import-source.test.ts
git commit -m "feat: import library — stub + full-text PDF ingestion"
```

---

## Task 9: `/api/lookup` route (preview)

**Files:**
- Create: `src/app/api/lookup/route.ts`

> No automated test — route handlers call `auth()` (next-auth) and external APIs, which the codebase does not unit-test (cf. `/api/upload`). The logic it wraps (`parseIdentifier`, `resolveSource`) is already covered by Tasks 3–5. Manual verification is in Task 11.

- [ ] **Step 1: Write the route**

```ts
// src/app/api/lookup/route.ts
import { z } from 'zod';
import { requireUser } from '@/lib/session';
import { parseIdentifier, resolveSource } from '@/lib/ingest/resolve';

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = z.object({ identifier: z.string().min(1) }).safeParse(body);
  if (!parsed.success) return Response.json({ error: 'identifier required' }, { status: 400 });

  const id = parseIdentifier(parsed.data.identifier);
  if (!id) {
    return Response.json({ error: 'Unrecognized identifier — paste a DOI or arXiv id/URL' }, { status: 400 });
  }

  try {
    const { metadata, pdfUrl, source } = await resolveSource(id);
    if (!metadata.title) {
      return Response.json({ error: 'No record found for that identifier' }, { status: 404 });
    }
    return Response.json({ metadata, fullTextAvailable: !!pdfUrl, source });
  } catch {
    return Response.json({ error: "Couldn't reach the lookup service — try again" }, { status: 502 });
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run lint`
Expected: PASS (no type/lint errors).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/lookup/route.ts
git commit -m "feat: add /api/lookup preview endpoint"
```

---

## Task 10: `/api/import` route (confirm)

**Files:**
- Create: `src/app/api/import/route.ts`

> No automated test, for the same reason as Task 9. The wrapped logic (`createImportedPaper`, `processImportedPdf`) is covered by Task 8.

- [ ] **Step 1: Write the route**

```ts
// src/app/api/import/route.ts
import { z } from 'zod';
import { after } from 'next/server';
import { db, schema } from '@/db/client';
import { requireUser, requireMember } from '@/lib/session';
import { getLLM } from '@/lib/llm';
import { parseIdentifier, resolveSource } from '@/lib/ingest/resolve';
import { createImportedPaper, processImportedPdf } from '@/lib/ingest/import-source';

export const maxDuration = 60; // allow download + extract + embed to run in after()

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = z
    .object({
      identifier: z.string().min(1),
      workspaceId: z.string().min(1),
      collectionId: z.string().nullish(),
    })
    .safeParse(body);
  if (!parsed.success) return Response.json({ error: 'identifier and workspaceId required' }, { status: 400 });
  const { identifier, workspaceId, collectionId } = parsed.data;

  if (!(await requireMember(workspaceId, user.id))) return new Response('Forbidden', { status: 403 });

  const id = parseIdentifier(identifier);
  if (!id) return Response.json({ error: 'Unrecognized identifier' }, { status: 400 });

  let resolved;
  try {
    resolved = await resolveSource(id);
  } catch {
    return Response.json({ error: "Couldn't reach the lookup service — try again" }, { status: 502 });
  }
  if (!resolved.metadata.title) {
    return Response.json({ error: 'No record found for that identifier' }, { status: 404 });
  }

  const { id: paperId, status } = await createImportedPaper(
    {
      workspaceId,
      collectionId: collectionId ?? null,
      userId: user.id,
      metadata: resolved.metadata,
      pdfUrl: resolved.pdfUrl,
    },
    { db, schema },
  );

  if (status === 'pending' && resolved.pdfUrl) {
    after(processImportedPdf(paperId, resolved.pdfUrl, resolved.metadata, { db, schema, llm: getLLM() }));
  }

  return Response.json({ id: paperId, status }, { status: 202 });
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/import/route.ts
git commit -m "feat: add /api/import confirm endpoint"
```

---

## Task 11: UploadForm — lookup mode + preview card

**Files:**
- Modify: `src/components/UploadForm.tsx`

> React client component. The codebase has no component-render tests (its `tests/ui/*` cover pure display helpers), so verification here is manual (Step 6).

- [ ] **Step 1: Replace the `pasteMode` boolean with a `mode` union and add lookup state**

In `src/components/UploadForm.tsx`, replace this line:

```ts
  const [pasteMode, setPasteMode] = useState(false);
```

with:

```ts
  const [mode, setMode] = useState<'file' | 'paste' | 'lookup'>('file');
  const [identifier, setIdentifier] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [preview, setPreview] = useState<
    { metadata: { title?: string; authors?: string[]; year?: number }; fullTextAvailable: boolean } | null
  >(null);
```

Then update every remaining reference to `pasteMode`/`setPasteMode`:
- `tabIndex={pasteMode ? -1 : 0}` → `tabIndex={mode === 'file' ? 0 : -1}`
- `onClick={() => !pasteMode && fileInputRef.current?.click()}` → `onClick={() => mode === 'file' && fileInputRef.current?.click()}`
- the `onKeyDown` guard `if (!pasteMode && ...)` → `if (mode === 'file' && ...)`
- `style={{ cursor: pasteMode ? 'default' : 'pointer' }}` → `style={{ cursor: mode === 'file' ? 'pointer' : 'default' }}`
- `{!pasteMode && ( ...paste button... )}` → `{mode === 'file' && ( ... )}`
- `{pasteMode && ( ...paste panel... )}` → `{mode === 'paste' && ( ... )}`
- in the paste panel's Cancel button and after a successful paste upload, replace `setPasteMode(false)` → `setMode('file')`
- in `handleUpload`'s success reset block, replace `setPasteMode(false)` → `setMode('file')`

- [ ] **Step 2: Add the "Import by DOI / arXiv" button next to "Paste text instead"**

Inside the `{mode === 'file' && (` block that holds the `.or-paste` div, add a second button (paper mode only):

```tsx
        {mode === 'file' && (
          <div className="or-paste">
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMode('paste');
              }}
            >
              <Icon name="note" size={14} /> Paste text instead
            </button>
            {kind === 'paper' && (
              <button
                className="btn btn-ghost btn-sm"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMode('lookup');
                }}
              >
                <Icon name="book" size={14} /> Import by DOI / arXiv
              </button>
            )}
          </div>
        )}
```

- [ ] **Step 3: Add the lookup + import handlers**

Add these functions inside the component, after `handleUpload`:

```ts
  async function handleLookup() {
    if (!identifier.trim()) return;
    setLookupLoading(true);
    setLookupError(null);
    setPreview(null);
    try {
      const res = await fetch('/api/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLookupError(data.error || `Lookup failed (${res.status})`);
        return;
      }
      setPreview({ metadata: data.metadata, fullTextAvailable: data.fullTextAvailable });
    } catch {
      setLookupError('Lookup failed. Please try again.');
    } finally {
      setLookupLoading(false);
    }
  }

  async function handleImport() {
    if (uploading) return;
    setUploading(true);
    setLookupError(null);
    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: identifier.trim(),
          workspaceId,
          collectionId: collectionId || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLookupError(data.error || `Import failed (${res.status})`);
        return;
      }
      const name = preview?.metadata.title || identifier.trim();
      setQueue((prev) => [{ id: data.id, name, status: data.status, kind: 'paper', pct: 0 }, ...prev]);
      // reset lookup panel
      setIdentifier('');
      setPreview(null);
      setMode('file');
    } catch {
      setLookupError('Import failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }
```

- [ ] **Step 4: Add the lookup panel UI**

Immediately after the `{mode === 'paste' && ( ... )}` block, add:

```tsx
      {mode === 'lookup' && (
        <div className="field" style={{ marginTop: 16 }}>
          <div className="row gap2">
            <input
              className="input"
              placeholder="Paste a DOI or arXiv id / URL…"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleLookup(); } }}
              style={{ flex: 1 }}
            />
            <button
              className="btn btn-primary"
              type="button"
              disabled={lookupLoading || !identifier.trim()}
              onClick={handleLookup}
            >
              {lookupLoading ? 'Looking up…' : 'Look up'}
            </button>
            <button
              className="btn btn-quiet btn-sm"
              type="button"
              onClick={() => { setMode('file'); setIdentifier(''); setPreview(null); setLookupError(null); }}
            >
              Cancel
            </button>
          </div>

          {lookupError && (
            <p className="meta" style={{ color: 'var(--danger)', marginTop: 10 }}>{lookupError}</p>
          )}

          {preview && (
            <div className="card" style={{ marginTop: 12, padding: 14 }}>
              <div style={{ fontWeight: 600, color: 'var(--ink)' }}>
                {preview.metadata.title || 'Untitled'}
              </div>
              <div className="meta" style={{ marginTop: 4 }}>
                {(preview.metadata.authors || []).join(', ')}
                {preview.metadata.year ? ` · ${preview.metadata.year}` : ''}
              </div>
              <div className="meta" style={{ marginTop: 8, color: preview.fullTextAvailable ? 'var(--accent)' : 'var(--muted)' }}>
                {preview.fullTextAvailable
                  ? '✓ Full text available — will be ingested for chat'
                  : 'Metadata only — no open-access full text (upload the PDF later to enable chat)'}
              </div>
              <div className="row gap2" style={{ marginTop: 12 }}>
                <button className="btn btn-primary" type="button" disabled={uploading} onClick={handleImport}>
                  {uploading ? 'Importing…' : 'Import'}
                </button>
                <button
                  className="btn btn-quiet btn-sm"
                  type="button"
                  onClick={() => setPreview(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
```

- [ ] **Step 5: Verify it compiles and the full suite is green**

Run: `npm run lint` then `npm test`
Expected: lint passes; all tests PASS.

- [ ] **Step 6: Manual verification**

Run: `npm run dev`, sign in, open a workspace's upload page. With **Paper** selected, click **Import by DOI / arXiv** and:
1. Enter `1706.03762` (arXiv "Attention Is All You Need") → Look up shows the title/authors and "✓ Full text available". Click **Import** → it appears in **Recent imports** and progresses `Pending → Processing → Ready`.
2. Enter a paywalled DOI (e.g. `10.1038/nphys1170`) → preview shows "Metadata only". Click **Import** → it appears with a **Metadata only** badge.
3. Enter garbage (`hello`) → Look up shows "Unrecognized identifier".

- [ ] **Step 7: Commit**

```bash
git add src/components/UploadForm.tsx
git commit -m "feat: import-by-identifier UI with metadata preview"
```

---

## Task 12: Configuration & docs

**Files:**
- Modify: `.env.example` (or the project's env file/docs — check what exists)

- [ ] **Step 1: Document the new env var**

Add to `.env.example` (create it only if the project already documents env vars there; otherwise add to the README/env docs):

```
# Contact email sent to keyless bibliographic APIs (CrossRef, Unpaywall, arXiv)
# as their "polite pool" identifier. Any valid mailbox for the project/admin.
UNPAYWALL_EMAIL=you@example.edu
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: document UNPAYWALL_EMAIL contact env var"
```

---

## Self-review notes (already applied)

- **Spec coverage:** resolve module (T3–5), lookup route (T9), import route (T10), full-text→pipeline reuse (T6, T8), metadata-only stub + status (T7, T8), UI preview/confirm (T11), env var + CrossRef consolidation (T1–2, T12). All spec sections map to a task.
- **Type consistency:** `Identifier`, `ResolvedSource`, `PaperMetadata` used consistently; `processDocument` input `metadata?` matches what `processImportedPdf` passes; route status union `'pending' | 'metadata_only'` matches `createImportedPaper`'s return.
- **No placeholders:** every code step shows complete code; every run step states the exact command and expected result.
