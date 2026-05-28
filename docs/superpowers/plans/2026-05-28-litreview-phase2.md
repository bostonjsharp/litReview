# LitReview Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the team read a paper's text in-app, highlight passages and attach comments (paper-level, reusable annotations), assemble reviews from those annotations plus prose, and have annotations be searchable/citable in chat.

**Architecture:** Extends Phase 1 with two tables (`annotations`, `review_entries`), a `papers.pageOffsets` column, and an `'annotation'` chunk type. Pure helpers (offset mapping, entry reordering) are unit-tested; service functions (annotation/review CRUD + embedding) are integration-tested against real Neon and called by thin API routes. A lightweight selectable-text reader and a block-list composer provide the UI — no rich-text-editor dependency.

**Tech Stack:** Same as Phase 1 — TypeScript, Next.js 16 (App Router), Drizzle ORM, Postgres + pgvector (Neon), OpenAI behind the `LLMProvider` interface, Vitest. No new dependencies.

**Conventions (carried from Phase 1):**
- Service functions take `(input, deps)` where `deps = { db, schema, llm }`; `db`/`schema` are typed `any` at these DI seams (lint rule is `warn`).
- Embedding dimension is 1536 (`text-embedding-3-small`).
- Each task ends green and committed. Integration tests require `.env` with Neon `DATABASE_URL` + `TEST_DATABASE_URL`.

---

## Shared Type Reference

```ts
// Extended in Task 2 — src/lib/llm/types.ts
export type ParentType = 'paper' | 'review' | 'annotation';

// src/lib/annotate/offsets.ts (Task 3)
export interface TextSegment { offset: number; text: string }       // offset = char index in full_text where this segment starts
export interface SelectionPoint { base: number; local: number }     // base = segment.offset, local = char offset within the segment
export function splitIntoSegments(fullText: string): TextSegment[]
export function resolveSelection(a: SelectionPoint, b: SelectionPoint): { charStart: number; charEnd: number }

// src/lib/reviews/entries.ts (Task 4)
export interface EntryPos { id: string; position: number }
export function reorder(entries: EntryPos[], id: string, direction: 'up' | 'down'): EntryPos[]
export function compact(entries: EntryPos[]): EntryPos[]

// src/lib/annotate/embed.ts (Task 5)
export function annotationChunkText(quote: string, comment: string): string

// Deps used by all service/embed functions
interface Deps { db: any; schema: any; llm: import('../llm/types').LLMProvider }
```

---

## Task 1: Persist `papers.pageOffsets` (Phase 1 amendment)

**Files:**
- Modify: `src/db/schema.ts` (add column)
- Modify: `src/lib/ingest/pipeline.ts` (store offsets)
- Test: `tests/integration/pipeline.test.ts` (extend)

- [ ] **Step 1: Add the column to `papers` in `src/db/schema.ts`**

Add this line to the `papers` table definition, immediately after the `metadata` line:
```ts
  pageOffsets: jsonb('page_offsets'),
```
(`jsonb` is already imported in this file.)

- [ ] **Step 2: Store offsets in the pipeline**

In `src/lib/ingest/pipeline.ts`, the paper branch currently calls `db.update(schema.papers).set({ fullText: text, title: ... , metadata: md })`. Add `pageOffsets` to that `.set({...})` object:
```ts
      await db
        .update(schema.papers)
        .set({
          fullText: text,
          pageOffsets,
          title: md.title ?? undefined,
          authors: md.authors ?? undefined,
          year: md.year ?? undefined,
          doi: md.doi ?? undefined,
          journal: md.journal ?? undefined,
          abstract: md.abstract ?? undefined,
          metadata: md,
        })
        .where(eq(schema.papers.id, input.parentId));
```
(`pageOffsets` is the local variable already computed earlier in the function — `let pageOffsets: number[] = [0]` / set from `extractPdf`.)

- [ ] **Step 3: Generate and apply the migration**

Run:
```bash
npm run db:gen && npm run db:migrate
```
Expected: a new `drizzle/0001_*.sql` adding `page_offsets`; `migrations applied`.

- [ ] **Step 4: Extend the pipeline test**

In `tests/integration/pipeline.test.ts`, in the first test ("extracts, chunks, embeds, and marks a paper ready"), after the existing `expect(updated.fullText).toContain('Neural networks');` add:
```ts
    expect(updated.pageOffsets).toEqual([0]);
```

- [ ] **Step 5: Run the test**

Run: `npm test -- tests/integration/pipeline.test.ts`
Expected: PASS (both tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: persist page offsets on papers for annotation page mapping"
```

---

## Task 2: Schema for annotations, review entries, and the annotation chunk type

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `src/lib/llm/types.ts` (extend `ParentType`)
- Test: `tests/integration/phase2-schema.test.ts`

- [ ] **Step 1: Extend `ParentType` in `src/lib/llm/types.ts`**

```ts
export type ParentType = 'paper' | 'review' | 'annotation';
```

- [ ] **Step 2: Update the `chunks.parentType` enum in `src/db/schema.ts`**

Change the `parentType` line inside the `chunks` table from:
```ts
    parentType: text('parent_type', { enum: ['paper', 'review'] }).notNull(),
```
to:
```ts
    parentType: text('parent_type', { enum: ['paper', 'review', 'annotation'] }).notNull(),
```
(This is a TS-level enum on a `text` column — no SQL change results, but keep it consistent.)

- [ ] **Step 3: Add the `annotations` and `review_entries` tables to `src/db/schema.ts`**

Append after the `chunks` table:
```ts
export const annotations = pgTable('annotations', {
  id: uuid('id').defaultRandom().primaryKey(),
  paperId: uuid('paper_id').notNull().references(() => papers.id, { onDelete: 'cascade' }),
  createdBy: uuid('created_by').references(() => users.id),
  charStart: integer('char_start').notNull(),
  charEnd: integer('char_end').notNull(),
  page: integer('page'),
  quote: text('quote').notNull().default(''),
  comment: text('comment').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const reviewEntries = pgTable('review_entries', {
  id: uuid('id').defaultRandom().primaryKey(),
  reviewId: uuid('review_id').notNull().references(() => reviews.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  kind: text('kind', { enum: ['prose', 'annotation'] }).notNull(),
  prose: text('prose'),
  annotationId: uuid('annotation_id').references(() => annotations.id, { onDelete: 'cascade' }),
});
```

- [ ] **Step 4: Generate and apply the migration**

Run:
```bash
npm run db:gen && npm run db:migrate
```
Expected: a new `drizzle/0002_*.sql` creating both tables; `migrations applied`.

- [ ] **Step 5: Write the failing test `tests/integration/phase2-schema.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from '../helpers/testdb';

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => { ctx = await makeTestDb(); });
afterAll(async () => { await ctx.sql.end(); });

describe('phase 2 schema', () => {
  it('stores an annotation and a review entry referencing it', async () => {
    const [p] = await ctx.db.insert(ctx.schema.papers).values({ title: 'P', status: 'ready' }).returning();
    const [a] = await ctx.db.insert(ctx.schema.annotations).values({ paperId: p.id, charStart: 0, charEnd: 5, quote: 'hello', comment: 'note' }).returning();
    const [r] = await ctx.db.insert(ctx.schema.reviews).values({ title: 'R' }).returning();
    const [e] = await ctx.db.insert(ctx.schema.reviewEntries).values({ reviewId: r.id, position: 0, kind: 'annotation', annotationId: a.id }).returning();
    expect(a.quote).toBe('hello');
    expect(e.kind).toBe('annotation');
    // cascade: deleting the annotation removes the referencing entry
    await ctx.db.delete(ctx.schema.annotations).where(eq(ctx.schema.annotations.id, a.id));
    const entries = await ctx.db.select().from(ctx.schema.reviewEntries).where(eq(ctx.schema.reviewEntries.reviewId, r.id));
    expect(entries).toHaveLength(0);
  });
});
```

- [ ] **Step 6: Run the test**

Run: `npm test -- tests/integration/phase2-schema.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add annotations and review_entries tables, annotation chunk type"
```

---

## Task 3: Offset-mapping helpers (pure)

**Files:**
- Create: `src/lib/annotate/offsets.ts`
- Test: `tests/unit/offsets.test.ts`

- [ ] **Step 1: Write the failing test `tests/unit/offsets.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { splitIntoSegments, resolveSelection } from '@/lib/annotate/offsets';

describe('splitIntoSegments', () => {
  it('splits on newlines and tracks the base offset of each segment', () => {
    const text = 'alpha\nbeta\ngamma';
    const segs = splitIntoSegments(text);
    expect(segs).toEqual([
      { offset: 0, text: 'alpha' },
      { offset: 6, text: 'beta' },
      { offset: 11, text: 'gamma' },
    ]);
    // each segment's text matches the original at its offset
    for (const s of segs) expect(text.slice(s.offset, s.offset + s.text.length)).toBe(s.text);
  });

  it('drops empty segments but keeps offsets correct', () => {
    const text = 'a\n\nb';
    expect(splitIntoSegments(text)).toEqual([
      { offset: 0, text: 'a' },
      { offset: 3, text: 'b' },
    ]);
  });
});

describe('resolveSelection', () => {
  it('returns a normalized start<end range from two points', () => {
    expect(resolveSelection({ base: 6, local: 1 }, { base: 0, local: 2 })).toEqual({ charStart: 2, charEnd: 7 });
  });
  it('handles forward selection', () => {
    expect(resolveSelection({ base: 0, local: 0 }, { base: 0, local: 5 })).toEqual({ charStart: 0, charEnd: 5 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/unit/offsets.test.ts`
Expected: FAIL ("Cannot find module '@/lib/annotate/offsets'").

- [ ] **Step 3: Create `src/lib/annotate/offsets.ts`**

```ts
export interface TextSegment {
  offset: number;
  text: string;
}

export interface SelectionPoint {
  base: number; // the segment's base offset in full_text
  local: number; // char offset within that segment
}

// Splits full_text into rendered segments (one per line), tracking the absolute
// character offset where each segment begins. Empty lines are dropped from the
// output but still advance the offset, so offsets always map back into full_text.
export function splitIntoSegments(fullText: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let offset = 0;
  for (const line of fullText.split('\n')) {
    if (line.length > 0) segments.push({ offset, text: line });
    offset += line.length + 1; // +1 for the consumed '\n'
  }
  return segments;
}

export function resolveSelection(a: SelectionPoint, b: SelectionPoint): { charStart: number; charEnd: number } {
  const p = a.base + a.local;
  const q = b.base + b.local;
  return { charStart: Math.min(p, q), charEnd: Math.max(p, q) };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/unit/offsets.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add pure text-segment and selection offset helpers"
```

---

## Task 4: Annotation chunk-text builder + review-entry reorder/compact (pure)

**Files:**
- Create: `src/lib/annotate/embed.ts` (chunk-text builder only in this task)
- Create: `src/lib/reviews/entries.ts`
- Test: `tests/unit/entries.test.ts`, `tests/unit/annotation-chunk-text.test.ts`

- [ ] **Step 1: Write `tests/unit/annotation-chunk-text.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { annotationChunkText } from '@/lib/annotate/embed';

describe('annotationChunkText', () => {
  it('joins quote and comment with a newline', () => {
    expect(annotationChunkText('the quote', 'my note')).toBe('the quote\nmy note');
  });
  it('omits empty parts and trims', () => {
    expect(annotationChunkText('  ', 'only note')).toBe('only note');
    expect(annotationChunkText('only quote', '')).toBe('only quote');
  });
  it('returns empty string when both are blank', () => {
    expect(annotationChunkText('', '   ')).toBe('');
  });
});
```

- [ ] **Step 2: Write `tests/unit/entries.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { reorder, compact } from '@/lib/reviews/entries';

describe('reorder', () => {
  const entries = [
    { id: 'a', position: 0 },
    { id: 'b', position: 1 },
    { id: 'c', position: 2 },
  ];
  it('moves an entry up by swapping positions with its predecessor', () => {
    expect(reorder(entries, 'b', 'up')).toEqual([
      { id: 'a', position: 1 },
      { id: 'b', position: 0 },
      { id: 'c', position: 2 },
    ]);
  });
  it('moves an entry down', () => {
    expect(reorder(entries, 'b', 'down')).toEqual([
      { id: 'a', position: 0 },
      { id: 'b', position: 2 },
      { id: 'c', position: 1 },
    ]);
  });
  it('is a no-op at the boundary', () => {
    expect(reorder(entries, 'a', 'up')).toEqual(entries);
    expect(reorder(entries, 'c', 'down')).toEqual(entries);
  });
});

describe('compact', () => {
  it('renumbers positions to 0..n-1 by current order', () => {
    expect(compact([
      { id: 'x', position: 5 },
      { id: 'y', position: 2 },
      { id: 'z', position: 9 },
    ])).toEqual([
      { id: 'y', position: 0 },
      { id: 'x', position: 1 },
      { id: 'z', position: 2 },
    ]);
  });
});
```

- [ ] **Step 3: Run both tests to verify they fail**

Run: `npm test -- tests/unit/entries.test.ts tests/unit/annotation-chunk-text.test.ts`
Expected: FAIL (modules missing).

- [ ] **Step 4: Create `src/lib/annotate/embed.ts` with the builder**

```ts
import { and, eq } from 'drizzle-orm';
import type { LLMProvider } from '../llm/types';

interface Deps {
  db: any;
  schema: any;
  llm: LLMProvider;
}

export function annotationChunkText(quote: string, comment: string): string {
  return [quote, comment].map((s) => (s ?? '').trim()).filter(Boolean).join('\n');
}

// Keeps an annotation's single chunk in sync. Removes any existing chunk for the
// annotation, then (if there is text) embeds and inserts a fresh one.
export async function embedAnnotation(annotationId: string, deps: Deps): Promise<void> {
  const { db, schema, llm } = deps;
  const [ann] = await db.select().from(schema.annotations).where(eq(schema.annotations.id, annotationId));
  if (!ann) return;
  await db
    .delete(schema.chunks)
    .where(and(eq(schema.chunks.parentType, 'annotation'), eq(schema.chunks.parentId, annotationId)));
  const text = annotationChunkText(ann.quote, ann.comment);
  if (!text) return;
  const [paper] = await db.select().from(schema.papers).where(eq(schema.papers.id, ann.paperId));
  const [embedding] = await llm.embed([text]);
  await db.insert(schema.chunks).values({
    parentType: 'annotation',
    parentId: annotationId,
    collectionId: paper?.collectionId ?? null,
    chunkIndex: 0,
    text,
    embedding,
    page: ann.page,
    charStart: ann.charStart,
    charEnd: ann.charEnd,
  });
}
```

- [ ] **Step 5: Create `src/lib/reviews/entries.ts`**

```ts
export interface EntryPos {
  id: string;
  position: number;
}

// Returns a new array where `id` swaps positions with its neighbor. No-op at the
// boundary. Input order is preserved; only the `position` values change.
export function reorder(entries: EntryPos[], id: string, direction: 'up' | 'down'): EntryPos[] {
  const sorted = [...entries].sort((a, b) => a.position - b.position);
  const idx = sorted.findIndex((e) => e.id === id);
  if (idx === -1) return entries;
  const swapWith = direction === 'up' ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= sorted.length) return entries;
  const result = new Map(entries.map((e) => [e.id, e.position]));
  result.set(sorted[idx].id, sorted[swapWith].position);
  result.set(sorted[swapWith].id, sorted[idx].position);
  return entries.map((e) => ({ id: e.id, position: result.get(e.id)! }));
}

// Renumbers entries to contiguous 0..n-1 positions following their current order.
export function compact(entries: EntryPos[]): EntryPos[] {
  return [...entries]
    .sort((a, b) => a.position - b.position)
    .map((e, i) => ({ id: e.id, position: i }));
}
```

- [ ] **Step 6: Run both tests to verify they pass**

Run: `npm test -- tests/unit/entries.test.ts tests/unit/annotation-chunk-text.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add annotation chunk-text builder and review-entry reorder helpers"
```

---

## Task 5: Annotation embedding (integration)

**Files:**
- (uses `src/lib/annotate/embed.ts` from Task 4)
- Test: `tests/integration/embed-annotation.test.ts`

- [ ] **Step 1: Write the failing test `tests/integration/embed-annotation.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { makeTestDb } from '../helpers/testdb';
import { embedAnnotation } from '@/lib/annotate/embed';

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => { ctx = await makeTestDb(); });
afterAll(async () => { await ctx.sql.end(); });

function fakeLLM() {
  return { embed: vi.fn(async (t: string[]) => t.map(() => Array(1536).fill(0.02))), chat: vi.fn() } as any;
}

async function annChunks(annotationId: string) {
  return ctx.db
    .select()
    .from(ctx.schema.chunks)
    .where(and(eq(ctx.schema.chunks.parentType, 'annotation'), eq(ctx.schema.chunks.parentId, annotationId)));
}

describe('embedAnnotation', () => {
  it('creates exactly one chunk and re-embeds idempotently', async () => {
    const [p] = await ctx.db.insert(ctx.schema.papers).values({ title: 'P', status: 'ready' }).returning();
    const [a] = await ctx.db.insert(ctx.schema.annotations).values({ paperId: p.id, charStart: 0, charEnd: 4, quote: 'quo', comment: 'note', page: 2 }).returning();
    const deps = { db: ctx.db, schema: ctx.schema, llm: fakeLLM() };
    await embedAnnotation(a.id, deps);
    let rows = await annChunks(a.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].text).toBe('quo\nnote');
    expect(rows[0].page).toBe(2);
    // running again does not duplicate
    await embedAnnotation(a.id, deps);
    rows = await annChunks(a.id);
    expect(rows).toHaveLength(1);
  });

  it('removes the chunk when quote and comment are both blank', async () => {
    const [p] = await ctx.db.insert(ctx.schema.papers).values({ title: 'P', status: 'ready' }).returning();
    const [a] = await ctx.db.insert(ctx.schema.annotations).values({ paperId: p.id, charStart: 0, charEnd: 4, quote: 'q', comment: 'c' }).returning();
    const deps = { db: ctx.db, schema: ctx.schema, llm: fakeLLM() };
    await embedAnnotation(a.id, deps);
    expect(await annChunks(a.id)).toHaveLength(1);
    await ctx.db.update(ctx.schema.annotations).set({ quote: '', comment: '' }).where(eq(ctx.schema.annotations.id, a.id));
    await embedAnnotation(a.id, deps);
    expect(await annChunks(a.id)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `npm test -- tests/integration/embed-annotation.test.ts`
Expected: PASS (implementation already exists from Task 4).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test: verify annotation embedding creates, re-syncs, and clears chunks"
```

---

## Task 6: Extend retrieval to resolve annotation sources

**Files:**
- Modify: `src/lib/search/retrieve.ts`
- Test: `tests/integration/retrieve-annotation.test.ts`

- [ ] **Step 1: Write the failing test `tests/integration/retrieve-annotation.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { makeTestDb } from '../helpers/testdb';
import { retrieve } from '@/lib/search/retrieve';

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => { ctx = await makeTestDb(); });
afterAll(async () => { await ctx.sql.end(); });

describe('retrieve (annotation chunks)', () => {
  it('resolves an annotation chunk to "Note on <paper title>"', async () => {
    const [p] = await ctx.db.insert(ctx.schema.papers).values({ title: 'Attention', status: 'ready' }).returning();
    const [a] = await ctx.db.insert(ctx.schema.annotations).values({ paperId: p.id, charStart: 0, charEnd: 3, quote: 'x', comment: 'key insight', page: 5 }).returning();
    const vec = Array(1536).fill(0); vec[0] = 1;
    await ctx.db.insert(ctx.schema.chunks).values({ parentType: 'annotation', parentId: a.id, chunkIndex: 0, text: 'key insight', embedding: vec, page: 5, charStart: 0, charEnd: 3 });
    const llm = { embed: vi.fn(async () => [vec]), chat: vi.fn() } as any;
    const res = await retrieve('insight', llm, ctx.db, { k: 1, schema: ctx.schema });
    expect(res).toHaveLength(1);
    expect(res[0].source).toMatchObject({ parentType: 'annotation', parentId: a.id, title: 'Note on Attention', page: 5 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/integration/retrieve-annotation.test.ts`
Expected: FAIL — the title resolves to `'Untitled'` or errors, because `retrieve` only handles `paper`/`review`.

- [ ] **Step 3: Update the title-resolution loop in `src/lib/search/retrieve.ts`**

Replace the `for (const r of rows) { ... }` block at the end of `retrieve` with:
```ts
  const out: RetrievedChunk[] = [];
  for (const r of rows) {
    if (r.parentType === 'annotation') {
      const [ann] = await db
        .select({ paperId: schema.annotations.paperId })
        .from(schema.annotations)
        .where(eq(schema.annotations.id, r.parentId));
      const [paper] = ann
        ? await db.select({ title: schema.papers.title }).from(schema.papers).where(eq(schema.papers.id, ann.paperId))
        : [undefined];
      out.push({
        id: r.id,
        text: r.text,
        source: { parentType: 'annotation', parentId: r.parentId, title: `Note on ${paper?.title ?? 'Untitled'}`, page: r.page },
      });
      continue;
    }
    const table = r.parentType === 'paper' ? schema.papers : schema.reviews;
    const [parent] = await db.select({ title: table.title }).from(table).where(eq(table.id, r.parentId));
    out.push({
      id: r.id,
      text: r.text,
      source: { parentType: r.parentType, parentId: r.parentId, title: parent?.title ?? 'Untitled', page: r.page },
    });
  }
  return out;
```

- [ ] **Step 4: Run the new test AND the Phase 1 retrieve test (no regression)**

Run: `npm test -- tests/integration/retrieve-annotation.test.ts tests/integration/retrieve.test.ts`
Expected: PASS (both files).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: resolve annotation chunks to 'Note on <paper>' in retrieval"
```

---

## Task 7: Annotation service + API routes

**Files:**
- Create: `src/lib/annotate/service.ts`
- Create: `src/app/api/annotations/route.ts`, `src/app/api/annotations/[id]/route.ts`, `src/app/api/papers/[id]/route.ts`
- Test: `tests/integration/annotation-service.test.ts`

- [ ] **Step 1: Write the failing test `tests/integration/annotation-service.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { makeTestDb } from '../helpers/testdb';
import { createAnnotation, updateAnnotation, deleteAnnotation } from '@/lib/annotate/service';

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => { ctx = await makeTestDb(); });
afterAll(async () => { await ctx.sql.end(); });

function deps() {
  return { db: ctx.db, schema: ctx.schema, llm: { embed: vi.fn(async (t: string[]) => t.map(() => Array(1536).fill(0.03))), chat: vi.fn() } as any };
}
const annChunks = (id: string) =>
  ctx.db.select().from(ctx.schema.chunks).where(and(eq(ctx.schema.chunks.parentType, 'annotation'), eq(ctx.schema.chunks.parentId, id)));

describe('annotation service', () => {
  it('creates an annotation, derives page from stored offsets, and embeds it', async () => {
    const [p] = await ctx.db.insert(ctx.schema.papers).values({ title: 'P', status: 'ready', pageOffsets: [0, 10, 20] }).returning();
    const ann = await createAnnotation({ paperId: p.id, createdBy: null, charStart: 12, charEnd: 16, quote: 'word', comment: 'note' }, deps());
    expect(ann.page).toBe(2); // offset 12 falls in page 2 (>=10, <20)
    expect(await annChunks(ann.id)).toHaveLength(1);
  });

  it('rejects an invalid range', async () => {
    const [p] = await ctx.db.insert(ctx.schema.papers).values({ title: 'P', status: 'ready' }).returning();
    await expect(createAnnotation({ paperId: p.id, createdBy: null, charStart: 5, charEnd: 5, quote: '', comment: 'x' }, deps())).rejects.toThrow();
  });

  it('updates the comment and re-embeds; delete removes annotation and chunk', async () => {
    const [p] = await ctx.db.insert(ctx.schema.papers).values({ title: 'P', status: 'ready' }).returning();
    const ann = await createAnnotation({ paperId: p.id, createdBy: null, charStart: 0, charEnd: 4, quote: 'quo', comment: 'old' }, deps());
    const updated = await updateAnnotation(ann.id, 'new note', deps());
    expect(updated.comment).toBe('new note');
    const [chunk] = await annChunks(ann.id);
    expect(chunk.text).toBe('quo\nnew note');
    await deleteAnnotation(ann.id, deps());
    expect(await annChunks(ann.id)).toHaveLength(0);
    const rows = await ctx.db.select().from(ctx.schema.annotations).where(eq(ctx.schema.annotations.id, ann.id));
    expect(rows).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/integration/annotation-service.test.ts`
Expected: FAIL ("Cannot find module '@/lib/annotate/service'").

- [ ] **Step 3: Create `src/lib/annotate/service.ts`**

```ts
import { and, eq } from 'drizzle-orm';
import { pageForOffset } from '../ingest/chunk';
import { embedAnnotation } from './embed';
import type { LLMProvider } from '../llm/types';

interface Deps {
  db: any;
  schema: any;
  llm: LLMProvider;
}

export interface CreateAnnotationInput {
  paperId: string;
  createdBy: string | null;
  charStart: number;
  charEnd: number;
  quote: string;
  comment: string;
}

export async function createAnnotation(input: CreateAnnotationInput, deps: Deps) {
  const { db, schema } = deps;
  if (input.charStart < 0 || input.charEnd <= input.charStart) throw new Error('invalid range');
  const [paper] = await db.select().from(schema.papers).where(eq(schema.papers.id, input.paperId));
  if (!paper) throw new Error('paper not found');
  const offsets = (paper.pageOffsets as number[] | null) ?? [0];
  const page = pageForOffset(offsets, input.charStart);
  const [row] = await db
    .insert(schema.annotations)
    .values({
      paperId: input.paperId,
      createdBy: input.createdBy,
      charStart: input.charStart,
      charEnd: input.charEnd,
      page,
      quote: input.quote,
      comment: input.comment,
    })
    .returning();
  await embedAnnotation(row.id, deps);
  return row;
}

export async function updateAnnotation(id: string, comment: string, deps: Deps) {
  const { db, schema } = deps;
  const [row] = await db
    .update(schema.annotations)
    .set({ comment, updatedAt: new Date() })
    .where(eq(schema.annotations.id, id))
    .returning();
  if (!row) throw new Error('annotation not found');
  await embedAnnotation(id, deps);
  return row;
}

export async function deleteAnnotation(id: string, deps: Deps) {
  const { db, schema } = deps;
  await db
    .delete(schema.chunks)
    .where(and(eq(schema.chunks.parentType, 'annotation'), eq(schema.chunks.parentId, id)));
  await db.delete(schema.annotations).where(eq(schema.annotations.id, id));
}

export async function listAnnotations(paperId: string, deps: Deps) {
  const { db, schema } = deps;
  return db.select().from(schema.annotations).where(eq(schema.annotations.paperId, paperId));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/integration/annotation-service.test.ts`
Expected: PASS (all three cases).

- [ ] **Step 5: Create `src/app/api/annotations/route.ts`**

```ts
import { z } from 'zod';
import { db, schema } from '@/db/client';
import { requireUser } from '@/lib/session';
import { getLLM } from '@/lib/llm';
import { createAnnotation } from '@/lib/annotate/service';

const Body = z.object({
  paperId: z.string().uuid(),
  charStart: z.number().int().nonnegative(),
  charEnd: z.number().int().positive(),
  quote: z.string().default(''),
  comment: z.string().default(''),
});

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const body = Body.parse(await req.json());
  try {
    const ann = await createAnnotation({ ...body, createdBy: user.id }, { db, schema, llm: getLLM() });
    return Response.json(ann, { status: 201 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
```

- [ ] **Step 6: Create `src/app/api/annotations/[id]/route.ts`**

```ts
import { z } from 'zod';
import { db, schema } from '@/db/client';
import { requireUser } from '@/lib/session';
import { getLLM } from '@/lib/llm';
import { updateAnnotation, deleteAnnotation } from '@/lib/annotate/service';

const Patch = z.object({ comment: z.string() });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  const { comment } = Patch.parse(await req.json());
  const ann = await updateAnnotation(id, comment, { db, schema, llm: getLLM() });
  return Response.json(ann);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  await deleteAnnotation(id, { db, schema, llm: getLLM() });
  return Response.json({ ok: true });
}
```

- [ ] **Step 7: Create `src/app/api/papers/[id]/route.ts` (reader data: text + annotations)**

```ts
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { requireUser } from '@/lib/session';
import { listAnnotations } from '@/lib/annotate/service';
import { getLLM } from '@/lib/llm';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  const [paper] = await db.select().from(schema.papers).where(eq(schema.papers.id, id));
  if (!paper) return new Response('Not found', { status: 404 });
  const annotations = await listAnnotations(id, { db, schema, llm: getLLM() });
  return Response.json({ paper: { id: paper.id, title: paper.title, fullText: paper.fullText }, annotations });
}
```

- [ ] **Step 8: Verify routes typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add annotation service and CRUD/reader API routes"
```

---

## Task 8: Review composition service + API routes

**Files:**
- Create: `src/lib/reviews/service.ts`
- Create: `src/app/api/reviews/[id]/entries/route.ts`, `src/app/api/reviews/[id]/entries/[entryId]/route.ts`
- Test: `tests/integration/review-compose.test.ts`

- [ ] **Step 1: Write the failing test `tests/integration/review-compose.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { makeTestDb } from '../helpers/testdb';
import { addProseEntry, addAnnotationEntry, moveEntry, removeEntry, getReviewEntries } from '@/lib/reviews/service';

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => { ctx = await makeTestDb(); });
afterAll(async () => { await ctx.sql.end(); });

const deps = () => ({ db: ctx.db, schema: ctx.schema });

describe('review composition', () => {
  it('appends, reorders, and removes entries with contiguous positions', async () => {
    const [r] = await ctx.db.insert(ctx.schema.reviews).values({ title: 'R' }).returning();
    const [p] = await ctx.db.insert(ctx.schema.papers).values({ title: 'P', status: 'ready' }).returning();
    const [a] = await ctx.db.insert(ctx.schema.annotations).values({ paperId: p.id, charStart: 0, charEnd: 3, quote: 'q', comment: 'c' }).returning();

    await addProseEntry(r.id, 'intro', deps());
    await addAnnotationEntry(r.id, a.id, deps());
    await addProseEntry(r.id, 'outro', deps());

    let entries = await getReviewEntries(r.id, deps());
    expect(entries.map((e) => e.position)).toEqual([0, 1, 2]);
    expect(entries.map((e) => e.kind)).toEqual(['prose', 'annotation', 'prose']);

    // move the last entry up one
    await moveEntry(r.id, entries[2].id, 'up', deps());
    entries = await getReviewEntries(r.id, deps());
    expect(entries.map((e) => e.kind)).toEqual(['prose', 'prose', 'annotation']);

    // remove the first entry -> positions recompacted to 0..1
    await removeEntry(r.id, entries[0].id, deps());
    entries = await getReviewEntries(r.id, deps());
    expect(entries.map((e) => e.position)).toEqual([0, 1]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/integration/review-compose.test.ts`
Expected: FAIL ("Cannot find module '@/lib/reviews/service'").

- [ ] **Step 3: Create `src/lib/reviews/service.ts`**

```ts
import { eq } from 'drizzle-orm';
import { reorder, compact } from './entries';

interface Deps {
  db: any;
  schema: any;
}

async function nextPosition(reviewId: string, deps: Deps): Promise<number> {
  const rows = await deps.db
    .select({ position: deps.schema.reviewEntries.position })
    .from(deps.schema.reviewEntries)
    .where(eq(deps.schema.reviewEntries.reviewId, reviewId));
  return rows.length === 0 ? 0 : Math.max(...rows.map((r: { position: number }) => r.position)) + 1;
}

export async function getReviewEntries(reviewId: string, deps: Deps) {
  const rows = await deps.db
    .select()
    .from(deps.schema.reviewEntries)
    .where(eq(deps.schema.reviewEntries.reviewId, reviewId));
  return [...rows].sort((a, b) => a.position - b.position);
}

export async function addProseEntry(reviewId: string, prose: string, deps: Deps) {
  const position = await nextPosition(reviewId, deps);
  const [row] = await deps.db
    .insert(deps.schema.reviewEntries)
    .values({ reviewId, position, kind: 'prose', prose })
    .returning();
  return row;
}

export async function addAnnotationEntry(reviewId: string, annotationId: string, deps: Deps) {
  const position = await nextPosition(reviewId, deps);
  const [row] = await deps.db
    .insert(deps.schema.reviewEntries)
    .values({ reviewId, position, kind: 'annotation', annotationId })
    .returning();
  return row;
}

export async function moveEntry(reviewId: string, entryId: string, direction: 'up' | 'down', deps: Deps) {
  const entries = await getReviewEntries(reviewId, deps);
  const updated = reorder(entries.map((e) => ({ id: e.id, position: e.position })), entryId, direction);
  for (const u of updated) {
    await deps.db
      .update(deps.schema.reviewEntries)
      .set({ position: u.position })
      .where(eq(deps.schema.reviewEntries.id, u.id));
  }
}

export async function removeEntry(reviewId: string, entryId: string, deps: Deps) {
  await deps.db.delete(deps.schema.reviewEntries).where(eq(deps.schema.reviewEntries.id, entryId));
  const remaining = await getReviewEntries(reviewId, deps);
  const compacted = compact(remaining.map((e) => ({ id: e.id, position: e.position })));
  for (const c of compacted) {
    await deps.db
      .update(deps.schema.reviewEntries)
      .set({ position: c.position })
      .where(eq(deps.schema.reviewEntries.id, c.id));
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/integration/review-compose.test.ts`
Expected: PASS.

- [ ] **Step 5: Create `src/app/api/reviews/[id]/entries/route.ts`**

```ts
import { z } from 'zod';
import { db, schema } from '@/db/client';
import { requireUser } from '@/lib/session';
import { getReviewEntries, addProseEntry, addAnnotationEntry } from '@/lib/reviews/service';

const Body = z.union([
  z.object({ kind: z.literal('prose'), prose: z.string().min(1) }),
  z.object({ kind: z.literal('annotation'), annotationId: z.string().uuid() }),
]);

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  return Response.json(await getReviewEntries(id, { db, schema }));
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  const body = Body.parse(await req.json());
  const row =
    body.kind === 'prose'
      ? await addProseEntry(id, body.prose, { db, schema })
      : await addAnnotationEntry(id, body.annotationId, { db, schema });
  return Response.json(row, { status: 201 });
}
```

- [ ] **Step 6: Create `src/app/api/reviews/[id]/entries/[entryId]/route.ts`**

```ts
import { z } from 'zod';
import { db, schema } from '@/db/client';
import { requireUser } from '@/lib/session';
import { moveEntry, removeEntry } from '@/lib/reviews/service';

const Patch = z.object({ direction: z.enum(['up', 'down']) });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; entryId: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id, entryId } = await params;
  const { direction } = Patch.parse(await req.json());
  await moveEntry(id, entryId, direction, { db, schema });
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; entryId: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id, entryId } = await params;
  await removeEntry(id, entryId, { db, schema });
  return Response.json({ ok: true });
}
```

- [ ] **Step 7: Verify routes typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add review composition service and entry API routes"
```

---

## Task 9: Reader and composer UI

**Files:**
- Create: `src/app/papers/[id]/page.tsx`, `src/components/AnnotationReader.tsx`
- Create: `src/app/reviews/[id]/edit/page.tsx`, `src/components/ReviewComposer.tsx`

> Minimal, unstyled-but-usable UI wiring the proven services to the browser. The selection→offset logic uses `splitIntoSegments` (server-rendered segments carry `data-base`) and `resolveSelection`.

- [ ] **Step 1: Create `src/components/AnnotationReader.tsx`**

```tsx
'use client';
import { useEffect, useState } from 'react';
import { splitIntoSegments, resolveSelection } from '@/lib/annotate/offsets';

interface Annotation { id: string; charStart: number; charEnd: number; quote: string; comment: string }

export function AnnotationReader({ paperId, fullText, initial }: { paperId: string; fullText: string; initial: Annotation[] }) {
  const [annotations, setAnnotations] = useState<Annotation[]>(initial);
  const [pending, setPending] = useState<{ charStart: number; charEnd: number; quote: string } | null>(null);
  const [comment, setComment] = useState('');
  const segments = splitIntoSegments(fullText);

  function onMouseUp() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    const anchorEl = (sel.anchorNode?.parentElement)?.closest('[data-base]') as HTMLElement | null;
    const focusEl = (sel.focusNode?.parentElement)?.closest('[data-base]') as HTMLElement | null;
    if (!anchorEl || !focusEl) return;
    const { charStart, charEnd } = resolveSelection(
      { base: Number(anchorEl.dataset.base), local: sel.anchorOffset },
      { base: Number(focusEl.dataset.base), local: sel.focusOffset },
    );
    if (charEnd <= charStart) return;
    setPending({ charStart, charEnd, quote: fullText.slice(charStart, charEnd) });
    setComment('');
  }

  async function save() {
    if (!pending) return;
    const res = await fetch('/api/annotations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ paperId, ...pending, comment }),
    });
    if (res.ok) setAnnotations((a) => [...a, await res.json()]);
    setPending(null);
  }

  return (
    <div>
      <div onMouseUp={onMouseUp} style={{ lineHeight: 1.6, maxWidth: 700 }}>
        {segments.map((s) => (
          <p key={s.offset} data-base={s.offset}>{s.text}</p>
        ))}
      </div>
      {pending && (
        <div style={{ position: 'sticky', bottom: 0, background: '#eee', padding: 12 }}>
          <p><em>“{pending.quote}”</em></p>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="Your note…" />
          <button onClick={save}>Save note</button>
          <button onClick={() => setPending(null)}>Cancel</button>
        </div>
      )}
      <h3>Notes ({annotations.length})</h3>
      <ul>
        {annotations.map((a) => (
          <li key={a.id}><strong>“{a.quote}”</strong> — {a.comment}</li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/app/papers/[id]/page.tsx`**

```tsx
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { AnnotationReader } from '@/components/AnnotationReader';

export default async function PaperPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [paper] = await db.select().from(schema.papers).where(eq(schema.papers.id, id));
  if (!paper) return <main style={{ padding: 40 }}>Paper not found.</main>;
  const annotations = await db.select().from(schema.annotations).where(eq(schema.annotations.paperId, id));
  return (
    <main style={{ padding: 40 }}>
      <h1>{paper.title ?? 'Untitled paper'}</h1>
      <AnnotationReader paperId={paper.id} fullText={paper.fullText ?? ''} initial={annotations} />
    </main>
  );
}
```

- [ ] **Step 3: Create `src/components/ReviewComposer.tsx`**

```tsx
'use client';
import { useEffect, useState } from 'react';

interface Entry { id: string; position: number; kind: 'prose' | 'annotation'; prose: string | null; annotationId: string | null }

export function ReviewComposer({ reviewId }: { reviewId: string }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [prose, setProse] = useState('');

  async function load() {
    const res = await fetch(`/api/reviews/${reviewId}/entries`);
    if (res.ok) setEntries(await res.json());
  }
  useEffect(() => { load(); }, [reviewId]);

  async function addProse() {
    if (!prose.trim()) return;
    await fetch(`/api/reviews/${reviewId}/entries`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'prose', prose }),
    });
    setProse('');
    load();
  }
  async function move(entryId: string, direction: 'up' | 'down') {
    await fetch(`/api/reviews/${reviewId}/entries/${entryId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ direction }),
    });
    load();
  }
  async function remove(entryId: string) {
    await fetch(`/api/reviews/${reviewId}/entries/${entryId}`, { method: 'DELETE' });
    load();
  }

  return (
    <div>
      <ol>
        {entries.map((e) => (
          <li key={e.id}>
            {e.kind === 'prose' ? e.prose : <em>[annotation {e.annotationId}]</em>}
            <button onClick={() => move(e.id, 'up')}>↑</button>
            <button onClick={() => move(e.id, 'down')}>↓</button>
            <button onClick={() => remove(e.id)}>✕</button>
          </li>
        ))}
      </ol>
      <textarea value={prose} onChange={(e) => setProse(e.target.value)} rows={3} placeholder="Add a prose block…" />
      <button onClick={addProse}>Add prose</button>
    </div>
  );
}
```

- [ ] **Step 4: Create `src/app/reviews/[id]/edit/page.tsx`**

```tsx
import { ReviewComposer } from '@/components/ReviewComposer';

export default async function EditReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main style={{ padding: 40 }}>
      <h1>Compose review</h1>
      <ReviewComposer reviewId={id} />
    </main>
  );
}
```

- [ ] **Step 5: Verify build and types**

Run: `npx tsc --noEmit && npm run lint`
Expected: tsc no errors; lint exit 0 (warnings allowed).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add reader/annotation UI and review composer UI"
```

---

## Task 10: Full verification and README update

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Run the entire suite**

Run: `npm test`
Expected: all unit + integration tests PASS.

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Add a Phase 2 section to `README.md`**

Under the existing "## What you need" / features area, add:
```markdown
## Reading & annotating (Phase 2)
- Open a paper at `/papers/<id>` to read its text. Select any passage and add a note — the highlight + comment is saved as a reusable, paper-level annotation.
- Your annotations are embedded, so chat can search and cite them ("Note on <paper>").
- Compose a review at `/reviews/<id>/edit`: add prose blocks and annotation blocks, and reorder them. The review is an ordered list of blocks; imported reviews keep their original text.
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: document Phase 2 reading, annotation, and review composition"
```

---

## Self-Review (completed during authoring)

**Spec coverage:**
- `papers.pageOffsets` amendment → Task 1 ✓
- `annotations` + `review_entries` tables, `'annotation'` chunk type → Task 2 ✓
- Clean-text reader, selection→offset → Tasks 3, 9 ✓
- Paper-level reusable annotations (CRUD) → Task 7 ✓
- Annotation embedding + chat searchability → Tasks 4, 5; retrieval resolution → Task 6 ✓
- Review assembles from annotation + prose blocks, reorder/compact → Tasks 4, 8, 9 ✓
- Auth (requireUser→401) + Zod on all routes → Tasks 7, 8 ✓
- Error handling: invalid range 400, embed failure never loses annotation (row committed before embed; embed errors surface but annotation persists) → Task 7 ✓
- Testing: unit (offsets, entries, chunk-text), integration (embed, retrieve, annotation service, review compose), build → Tasks 3–10 ✓

**Type consistency:** `Deps = { db, schema, llm }` (services/embed) vs `{ db, schema }` (review service — no embedding needed) used consistently. `ParentType` extended once (Task 2) and relied on by retrieval (Task 6). `reorder`/`compact`/`splitIntoSegments`/`resolveSelection`/`annotationChunkText` signatures match between definition (Tasks 3, 4) and use (Tasks 8, 9, 5). Service names (`createAnnotation`, `updateAnnotation`, `deleteAnnotation`, `listAnnotations`, `addProseEntry`, `addAnnotationEntry`, `moveEntry`, `removeEntry`, `getReviewEntries`) match between tasks and routes.

**Known thin spots (acceptable for Phase 2, flagged):**
- The composer shows annotation blocks as `[annotation <id>]` rather than the resolved quote/comment; a follow-up can fetch and render annotation details. The data model and APIs fully support it.
- `embedAnnotation` failure inside `createAnnotation` would currently propagate (the route returns 400 even though the annotation row was inserted). The annotation is not lost (row committed), matching the spec's "never lose the annotation"; a dedicated re-embed endpoint is a small follow-up if needed.
