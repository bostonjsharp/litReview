# LitReview Phase 3a Implementation Plan — Themes & Literature Matrix

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the team tag Phase 2 annotations with per-collection themes and view a derived papers × themes literature matrix, with optional non-destructive LLM theme suggestions.

**Architecture:** Adds two tables (`themes`, `annotation_themes`), a pure `assembleMatrix` shaping function, pure suggestion parse/prompt helpers, a theme/tagging/matrix service, one `LLMProvider.complete()` method, thin API routes, and minimal UI (matrix grid, theme chips in the reader, a suggest-and-apply panel). The matrix is derived by query, never stored. LLM suggestions are read-only; applying them uses the normal create/tag routes.

**Tech Stack:** Same as Phases 1–2 — TypeScript, Next.js 16 (App Router), Drizzle ORM, Postgres + pgvector (Neon), OpenAI behind `LLMProvider`, Vitest. No new dependencies.

**Conventions (from Phases 1–2):** services take `(args, deps)` with `deps = { db, schema }` (plus `llm` when needed); `db`/`schema` are `any` at DI seams (lint `warn`); each task ends green and committed; integration tests use the Neon `.env`.

---

## Shared Type Reference

```ts
// src/lib/themes/matrix.ts (Task 3)
export interface MatrixPaper { id: string; title: string | null }
export interface MatrixTheme { id: string; name: string }
export interface AnnotationCell { id: string; quote: string; comment: string; page: number | null }
export interface TaggedAnnotation { annotationId: string; paperId: string; themeId: string; quote: string; comment: string; page: number | null }
export interface Matrix {
  themes: MatrixTheme[];
  papers: MatrixPaper[];
  cells: Record<string, Record<string, AnnotationCell[]>>; // cells[paperId][themeId]
}
export function assembleMatrix(papers: MatrixPaper[], themes: MatrixTheme[], tagged: TaggedAnnotation[]): Matrix;

// src/lib/themes/suggest.ts (Task 4)
export interface ThemeSuggestion { themes: string[]; assignments: { annotationId: string; themes: string[] }[] }
export function buildSuggestionPrompt(annotations: { annotationId: string; quote: string; comment: string }[]): string;
export function parseSuggestion(raw: string): ThemeSuggestion;

// LLM provider extension (Task 2) — src/lib/llm/types.ts
// interface LLMProvider gains: complete(prompt: string): Promise<string>;
```

---

## Task 1: Schema — `themes` and `annotation_themes`

**Files:**
- Modify: `src/db/schema.ts`
- Test: `tests/integration/themes-schema.test.ts`

- [ ] **Step 1: Add the tables to `src/db/schema.ts`**

Append after the `reviewEntries` table:
```ts
export const themes = pgTable('themes', {
  id: uuid('id').defaultRandom().primaryKey(),
  collectionId: uuid('collection_id').notNull().references(() => collections.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const annotationThemes = pgTable(
  'annotation_themes',
  {
    annotationId: uuid('annotation_id').notNull().references(() => annotations.id, { onDelete: 'cascade' }),
    themeId: uuid('theme_id').notNull().references(() => themes.id, { onDelete: 'cascade' }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.annotationId, t.themeId] }) }),
);
```
(`primaryKey` is already imported in this file.)

- [ ] **Step 2: Generate and apply the migration**

Run:
```bash
npm run db:gen && npm run db:migrate
```
Expected: a new `drizzle/0003_*.sql` creating both tables; `migrations applied`.

- [ ] **Step 3: Write the failing test `tests/integration/themes-schema.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { makeTestDb } from '../helpers/testdb';

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => { ctx = await makeTestDb(); });
afterAll(async () => { await ctx.sql.end(); });

describe('themes schema', () => {
  it('tags an annotation with a theme and cascades on theme delete', async () => {
    const [c] = await ctx.db.insert(ctx.schema.collections).values({ name: 'C' }).returning();
    const [p] = await ctx.db.insert(ctx.schema.papers).values({ collectionId: c.id, title: 'P', status: 'ready' }).returning();
    const [a] = await ctx.db.insert(ctx.schema.annotations).values({ paperId: p.id, charStart: 0, charEnd: 3, quote: 'q', comment: 'note' }).returning();
    const [t] = await ctx.db.insert(ctx.schema.themes).values({ collectionId: c.id, name: 'Method' }).returning();
    await ctx.db.insert(ctx.schema.annotationThemes).values({ annotationId: a.id, themeId: t.id });
    let links = await ctx.db.select().from(ctx.schema.annotationThemes).where(eq(ctx.schema.annotationThemes.annotationId, a.id));
    expect(links).toHaveLength(1);
    await ctx.db.delete(ctx.schema.themes).where(eq(ctx.schema.themes.id, t.id));
    links = await ctx.db.select().from(ctx.schema.annotationThemes).where(eq(ctx.schema.annotationThemes.annotationId, a.id));
    expect(links).toHaveLength(0);
  });
});
```

- [ ] **Step 4: Run the test**

Run: `npm test -- tests/integration/themes-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add themes and annotation_themes tables"
```

---

## Task 2: `LLMProvider.complete()`

**Files:**
- Modify: `src/lib/llm/types.ts`, `src/lib/llm/openai.ts`
- Test: `tests/unit/llm-complete.test.ts`

- [ ] **Step 1: Add `complete` to the `LLMProvider` interface in `src/lib/llm/types.ts`**

Add this line inside the `LLMProvider` interface (after `chat`):
```ts
  complete(prompt: string): Promise<string>;
```

- [ ] **Step 2: Write the failing test `tests/unit/llm-complete.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest';
import { OpenAIProvider } from '@/lib/llm/openai';

describe('OpenAIProvider.complete', () => {
  it('returns the raw message content from a chat completion', async () => {
    const client = {
      embeddings: { create: vi.fn() },
      chat: { completions: { create: vi.fn().mockResolvedValue({ choices: [{ message: { content: '{"themes":[]}' } }] }) } },
    } as any;
    const p = new OpenAIProvider(client);
    const out = await p.complete('do the thing');
    expect(out).toBe('{"themes":[]}');
    expect(client.chat.completions.create).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- tests/unit/llm-complete.test.ts`
Expected: FAIL ("complete is not a function").

- [ ] **Step 4: Implement `complete` in `src/lib/llm/openai.ts`**

Add this method to the `OpenAIProvider` class (after `chat`):
```ts
  async complete(prompt: string): Promise<string> {
    const res = await this.client.chat.completions.create({
      model: CHAT_MODEL,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    });
    return res.choices[0].message.content ?? '';
  }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- tests/unit/llm-complete.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add complete() to the LLM provider interface"
```

---

## Task 3: `assembleMatrix` (pure)

**Files:**
- Create: `src/lib/themes/matrix.ts`
- Test: `tests/unit/matrix.test.ts`

- [ ] **Step 1: Write the failing test `tests/unit/matrix.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { assembleMatrix } from '@/lib/themes/matrix';

describe('assembleMatrix', () => {
  const papers = [{ id: 'p1', title: 'A' }, { id: 'p2', title: 'B' }];
  const themes = [{ id: 't1', name: 'Method' }, { id: 't2', name: 'Result' }];

  it('places tagged annotations into the correct (paper, theme) cells', () => {
    const tagged = [
      { annotationId: 'a1', paperId: 'p1', themeId: 't1', quote: 'q1', comment: 'c1', page: 2 },
      { annotationId: 'a2', paperId: 'p1', themeId: 't1', quote: 'q2', comment: 'c2', page: 3 },
      { annotationId: 'a3', paperId: 'p2', themeId: 't2', quote: 'q3', comment: 'c3', page: null },
    ];
    const m = assembleMatrix(papers, themes, tagged);
    expect(m.papers).toBe(papers);
    expect(m.themes).toBe(themes);
    expect(m.cells['p1']['t1'].map((c) => c.id)).toEqual(['a1', 'a2']);
    expect(m.cells['p2']['t2']).toEqual([{ id: 'a3', quote: 'q3', comment: 'c3', page: null }]);
    expect(m.cells['p1']?.['t2']).toBeUndefined();
  });

  it('returns empty cells for no tags', () => {
    const m = assembleMatrix(papers, themes, []);
    expect(m.cells).toEqual({});
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/unit/matrix.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Create `src/lib/themes/matrix.ts`**

```ts
export interface MatrixPaper {
  id: string;
  title: string | null;
}
export interface MatrixTheme {
  id: string;
  name: string;
}
export interface AnnotationCell {
  id: string;
  quote: string;
  comment: string;
  page: number | null;
}
export interface TaggedAnnotation {
  annotationId: string;
  paperId: string;
  themeId: string;
  quote: string;
  comment: string;
  page: number | null;
}
export interface Matrix {
  themes: MatrixTheme[];
  papers: MatrixPaper[];
  cells: Record<string, Record<string, AnnotationCell[]>>;
}

export function assembleMatrix(papers: MatrixPaper[], themes: MatrixTheme[], tagged: TaggedAnnotation[]): Matrix {
  const cells: Record<string, Record<string, AnnotationCell[]>> = {};
  for (const t of tagged) {
    (cells[t.paperId] ??= {});
    (cells[t.paperId][t.themeId] ??= []).push({ id: t.annotationId, quote: t.quote, comment: t.comment, page: t.page });
  }
  return { themes, papers, cells };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/unit/matrix.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add pure assembleMatrix shaping function"
```

---

## Task 4: Suggestion prompt + parser (pure)

**Files:**
- Create: `src/lib/themes/suggest.ts`
- Test: `tests/unit/suggest.test.ts`

- [ ] **Step 1: Write the failing test `tests/unit/suggest.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { buildSuggestionPrompt, parseSuggestion } from '@/lib/themes/suggest';

describe('buildSuggestionPrompt', () => {
  it('includes each annotation id and its text, and asks for strict JSON', () => {
    const prompt = buildSuggestionPrompt([{ annotationId: 'a1', quote: 'q', comment: 'c' }]);
    expect(prompt).toContain('a1');
    expect(prompt).toContain('JSON');
    expect(prompt).toContain('assignments');
  });
});

describe('parseSuggestion', () => {
  it('parses valid suggestion JSON', () => {
    const raw = JSON.stringify({ themes: ['Method', 'Result'], assignments: [{ annotationId: 'a1', themes: ['Method'] }] });
    expect(parseSuggestion(raw)).toEqual({ themes: ['Method', 'Result'], assignments: [{ annotationId: 'a1', themes: ['Method'] }] });
  });
  it('drops assignment themes not in the proposed set', () => {
    const raw = JSON.stringify({ themes: ['Method'], assignments: [{ annotationId: 'a1', themes: ['Method', 'Bogus'] }] });
    expect(parseSuggestion(raw).assignments[0].themes).toEqual(['Method']);
  });
  it('throws on malformed JSON', () => {
    expect(() => parseSuggestion('not json')).toThrow();
  });
  it('throws when the shape is wrong', () => {
    expect(() => parseSuggestion(JSON.stringify({ foo: 1 }))).toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/unit/suggest.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Create `src/lib/themes/suggest.ts`**

```ts
export interface ThemeSuggestion {
  themes: string[];
  assignments: { annotationId: string; themes: string[] }[];
}

export function buildSuggestionPrompt(annotations: { annotationId: string; quote: string; comment: string }[]): string {
  const items = annotations
    .map((a) => `- id=${a.annotationId}: "${a.quote}" — ${a.comment}`)
    .join('\n');
  return [
    'You are organizing a literature review. Below are annotations (highlighted quotes and notes) from a set of papers.',
    'Propose a small set of cross-cutting themes (3–8) and assign each annotation to the theme(s) it belongs to.',
    'Respond as STRICT JSON only: {"themes": string[], "assignments": [{"annotationId": string, "themes": string[]}]}.',
    'Every theme name used in "assignments" MUST appear in "themes". Use the exact annotation ids given.',
    '',
    'Annotations:',
    items,
  ].join('\n');
}

export function parseSuggestion(raw: string): ThemeSuggestion {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    throw new Error('suggestion JSON is malformed');
  }
  const o = obj as { themes?: unknown; assignments?: unknown };
  if (!o || !Array.isArray(o.themes) || !Array.isArray(o.assignments)) {
    throw new Error('suggestion shape is invalid');
  }
  const themes = (o.themes as unknown[])
    .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
    .map((t) => t.trim());
  const themeSet = new Set(themes);
  const assignments = (o.assignments as unknown[])
    .filter((a): a is { annotationId: string; themes: unknown[] } =>
      !!a && typeof (a as { annotationId?: unknown }).annotationId === 'string' && Array.isArray((a as { themes?: unknown }).themes),
    )
    .map((a) => ({
      annotationId: a.annotationId,
      themes: (a.themes as unknown[]).filter((t): t is string => typeof t === 'string' && themeSet.has(t)),
    }));
  return { themes, assignments };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/unit/suggest.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add theme-suggestion prompt builder and response parser"
```

---

## Task 5: Theme/tagging/matrix service

**Files:**
- Create: `src/lib/themes/service.ts`
- Test: `tests/integration/theme-service.test.ts`

- [ ] **Step 1: Write the failing test `tests/integration/theme-service.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { makeTestDb } from '../helpers/testdb';
import { createTheme, listThemes, deleteTheme, tagAnnotation, untagAnnotation, getMatrix } from '@/lib/themes/service';

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => { ctx = await makeTestDb(); });
afterAll(async () => { await ctx.sql.end(); });
const deps = () => ({ db: ctx.db, schema: ctx.schema });

async function setup() {
  const [c] = await ctx.db.insert(ctx.schema.collections).values({ name: 'C' }).returning();
  const [p1] = await ctx.db.insert(ctx.schema.papers).values({ collectionId: c.id, title: 'A', status: 'ready' }).returning();
  const [p2] = await ctx.db.insert(ctx.schema.papers).values({ collectionId: c.id, title: 'B', status: 'ready' }).returning();
  const [a1] = await ctx.db.insert(ctx.schema.annotations).values({ paperId: p1.id, charStart: 0, charEnd: 3, quote: 'q1', comment: 'c1', page: 1 }).returning();
  const [a2] = await ctx.db.insert(ctx.schema.annotations).values({ paperId: p2.id, charStart: 0, charEnd: 3, quote: 'q2', comment: 'c2', page: 2 }).returning();
  return { c, p1, p2, a1, a2 };
}

describe('theme service', () => {
  it('creates, lists, tags, and builds a matrix; untags and deletes', async () => {
    const { c, p1, p2, a1, a2 } = await setup();
    const t = await createTheme(c.id, 'Method', null, deps());
    expect((await listThemes(c.id, deps())).map((x) => x.name)).toEqual(['Method']);

    await tagAnnotation(a1.id, t.id, deps());
    await tagAnnotation(a1.id, t.id, deps()); // idempotent
    await tagAnnotation(a2.id, t.id, deps());

    const m = await getMatrix(c.id, deps());
    expect(m.papers.map((x) => x.id).sort()).toEqual([p1.id, p2.id].sort());
    expect(m.themes.map((x) => x.name)).toEqual(['Method']);
    expect(m.cells[p1.id][t.id].map((x) => x.quote)).toEqual(['q1']);
    expect(m.cells[p2.id][t.id].map((x) => x.quote)).toEqual(['q2']);

    await untagAnnotation(a1.id, t.id, deps());
    const m2 = await getMatrix(c.id, deps());
    expect(m2.cells[p1.id]?.[t.id]).toBeUndefined();

    await deleteTheme(t.id, deps());
    expect(await listThemes(c.id, deps())).toHaveLength(0);
  });

  it('rejects tagging with a theme from another collection', async () => {
    const { a1 } = await setup();
    const [other] = await ctx.db.insert(ctx.schema.collections).values({ name: 'Other' }).returning();
    const t = await createTheme(other.id, 'X', null, deps());
    await expect(tagAnnotation(a1.id, t.id, deps())).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/integration/theme-service.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Create `src/lib/themes/service.ts`**

```ts
import { and, eq, inArray } from 'drizzle-orm';
import { assembleMatrix, type Matrix, type TaggedAnnotation } from './matrix';

interface Deps {
  db: any;
  schema: any;
}

export async function createTheme(collectionId: string, name: string, createdBy: string | null, deps: Deps) {
  const [row] = await deps.db
    .insert(deps.schema.themes)
    .values({ collectionId, name, createdBy })
    .returning();
  return row;
}

export async function renameTheme(themeId: string, name: string, deps: Deps) {
  const [row] = await deps.db
    .update(deps.schema.themes)
    .set({ name })
    .where(eq(deps.schema.themes.id, themeId))
    .returning();
  if (!row) throw new Error('theme not found');
  return row;
}

export async function deleteTheme(themeId: string, deps: Deps) {
  await deps.db.delete(deps.schema.themes).where(eq(deps.schema.themes.id, themeId));
}

export async function listThemes(collectionId: string, deps: Deps) {
  return deps.db.select().from(deps.schema.themes).where(eq(deps.schema.themes.collectionId, collectionId));
}

export async function tagAnnotation(annotationId: string, themeId: string, deps: Deps) {
  const { db, schema } = deps;
  const [ann] = await db.select({ paperId: schema.annotations.paperId }).from(schema.annotations).where(eq(schema.annotations.id, annotationId));
  if (!ann) throw new Error('annotation not found');
  const [paper] = await db.select({ collectionId: schema.papers.collectionId }).from(schema.papers).where(eq(schema.papers.id, ann.paperId));
  const [theme] = await db.select({ collectionId: schema.themes.collectionId }).from(schema.themes).where(eq(schema.themes.id, themeId));
  if (!theme) throw new Error('theme not found');
  if (!paper?.collectionId || paper.collectionId !== theme.collectionId) {
    throw new Error('theme and annotation are in different collections');
  }
  await db.insert(schema.annotationThemes).values({ annotationId, themeId }).onConflictDoNothing();
}

export async function untagAnnotation(annotationId: string, themeId: string, deps: Deps) {
  const { db, schema } = deps;
  await db
    .delete(schema.annotationThemes)
    .where(and(eq(schema.annotationThemes.annotationId, annotationId), eq(schema.annotationThemes.themeId, themeId)));
}

export async function getMatrix(collectionId: string, deps: Deps): Promise<Matrix> {
  const { db, schema } = deps;
  const papers = await db.select({ id: schema.papers.id, title: schema.papers.title }).from(schema.papers).where(eq(schema.papers.collectionId, collectionId));
  const themes = await db.select({ id: schema.themes.id, name: schema.themes.name }).from(schema.themes).where(eq(schema.themes.collectionId, collectionId));
  const themeIds = themes.map((t: { id: string }) => t.id);
  let tagged: TaggedAnnotation[] = [];
  if (themeIds.length > 0) {
    tagged = await db
      .select({
        annotationId: schema.annotations.id,
        paperId: schema.annotations.paperId,
        themeId: schema.annotationThemes.themeId,
        quote: schema.annotations.quote,
        comment: schema.annotations.comment,
        page: schema.annotations.page,
      })
      .from(schema.annotationThemes)
      .innerJoin(schema.annotations, eq(schema.annotationThemes.annotationId, schema.annotations.id))
      .where(inArray(schema.annotationThemes.themeId, themeIds));
  }
  return assembleMatrix(papers, themes, tagged);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/integration/theme-service.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add theme CRUD, tagging, and derived-matrix service"
```

---

## Task 6: `suggestThemes` service

**Files:**
- Modify: `src/lib/themes/service.ts` (add `suggestThemes` + `listCollectionAnnotations`)
- Test: `tests/integration/suggest-themes.test.ts`

- [ ] **Step 1: Write the failing test `tests/integration/suggest-themes.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { makeTestDb } from '../helpers/testdb';
import { suggestThemes } from '@/lib/themes/service';

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => { ctx = await makeTestDb(); });
afterAll(async () => { await ctx.sql.end(); });

describe('suggestThemes', () => {
  it('feeds collection annotations to complete() and returns parsed suggestions without writing', async () => {
    const [c] = await ctx.db.insert(ctx.schema.collections).values({ name: 'C' }).returning();
    const [p] = await ctx.db.insert(ctx.schema.papers).values({ collectionId: c.id, title: 'P', status: 'ready' }).returning();
    const [a] = await ctx.db.insert(ctx.schema.annotations).values({ paperId: p.id, charStart: 0, charEnd: 3, quote: 'q', comment: 'about methods' }).returning();

    const complete = vi.fn(async (prompt: string) => {
      expect(prompt).toContain(a.id); // the annotation id is in the prompt
      return JSON.stringify({ themes: ['Method'], assignments: [{ annotationId: a.id, themes: ['Method'] }] });
    });
    const llm = { embed: vi.fn(), chat: vi.fn(), complete } as any;

    const suggestion = await suggestThemes(c.id, { db: ctx.db, schema: ctx.schema, llm });
    expect(suggestion.themes).toEqual(['Method']);
    expect(suggestion.assignments[0].annotationId).toBe(a.id);

    // nothing was written
    expect(await ctx.db.select().from(ctx.schema.themes)).toHaveLength(0);
    expect(await ctx.db.select().from(ctx.schema.annotationThemes)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/integration/suggest-themes.test.ts`
Expected: FAIL ("suggestThemes is not a function" / not exported).

- [ ] **Step 3: Add `suggestThemes` to `src/lib/themes/service.ts`**

At the top of the file, extend the imports and `Deps`:
```ts
import { buildSuggestionPrompt, parseSuggestion, type ThemeSuggestion } from './suggest';
import type { LLMProvider } from '../llm/types';
```
Add a deps type that includes the LLM and the function (append at the end of the file):
```ts
interface SuggestDeps extends Deps {
  llm: LLMProvider;
}

export async function listCollectionAnnotations(collectionId: string, deps: Deps) {
  const { db, schema } = deps;
  return db
    .select({ annotationId: schema.annotations.id, quote: schema.annotations.quote, comment: schema.annotations.comment })
    .from(schema.annotations)
    .innerJoin(schema.papers, eq(schema.annotations.paperId, schema.papers.id))
    .where(eq(schema.papers.collectionId, collectionId));
}

export async function suggestThemes(collectionId: string, deps: SuggestDeps): Promise<ThemeSuggestion> {
  const annotations = await listCollectionAnnotations(collectionId, deps);
  const raw = await deps.llm.complete(buildSuggestionPrompt(annotations));
  return parseSuggestion(raw);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/integration/suggest-themes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add non-destructive LLM theme-suggestion service"
```

---

## Task 7: API routes

**Files:**
- Create: `src/app/api/collections/[id]/themes/route.ts`, `src/app/api/themes/[id]/route.ts`, `src/app/api/annotations/[id]/themes/route.ts`, `src/app/api/annotations/[id]/themes/[themeId]/route.ts`, `src/app/api/collections/[id]/matrix/route.ts`, `src/app/api/collections/[id]/suggest-themes/route.ts`

- [ ] **Step 1: Create `src/app/api/collections/[id]/themes/route.ts`**

```ts
import { z } from 'zod';
import { db, schema } from '@/db/client';
import { requireUser } from '@/lib/session';
import { createTheme, listThemes } from '@/lib/themes/service';

const Body = z.object({ name: z.string().min(1) });

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  return Response.json(await listThemes(id, { db, schema }));
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  const { name } = Body.parse(await req.json());
  const theme = await createTheme(id, name, user.id, { db, schema });
  return Response.json(theme, { status: 201 });
}
```

- [ ] **Step 2: Create `src/app/api/themes/[id]/route.ts`**

```ts
import { z } from 'zod';
import { db, schema } from '@/db/client';
import { requireUser } from '@/lib/session';
import { renameTheme, deleteTheme } from '@/lib/themes/service';

const Patch = z.object({ name: z.string().min(1) });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  const { name } = Patch.parse(await req.json());
  return Response.json(await renameTheme(id, name, { db, schema }));
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  await deleteTheme(id, { db, schema });
  return Response.json({ ok: true });
}
```

- [ ] **Step 3: Create `src/app/api/annotations/[id]/themes/route.ts`**

```ts
import { z } from 'zod';
import { db, schema } from '@/db/client';
import { requireUser } from '@/lib/session';
import { tagAnnotation } from '@/lib/themes/service';

const Body = z.object({ themeId: z.string().uuid() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  const { themeId } = Body.parse(await req.json());
  try {
    await tagAnnotation(id, themeId, { db, schema });
    return Response.json({ ok: true }, { status: 201 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
```

- [ ] **Step 4: Create `src/app/api/annotations/[id]/themes/[themeId]/route.ts`**

```ts
import { db, schema } from '@/db/client';
import { requireUser } from '@/lib/session';
import { untagAnnotation } from '@/lib/themes/service';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; themeId: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id, themeId } = await params;
  await untagAnnotation(id, themeId, { db, schema });
  return Response.json({ ok: true });
}
```

- [ ] **Step 5: Create `src/app/api/collections/[id]/matrix/route.ts`**

```ts
import { db, schema } from '@/db/client';
import { requireUser } from '@/lib/session';
import { getMatrix } from '@/lib/themes/service';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  return Response.json(await getMatrix(id, { db, schema }));
}
```

- [ ] **Step 6: Create `src/app/api/collections/[id]/suggest-themes/route.ts`**

```ts
import { db, schema } from '@/db/client';
import { requireUser } from '@/lib/session';
import { getLLM } from '@/lib/llm';
import { suggestThemes } from '@/lib/themes/service';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  try {
    return Response.json(await suggestThemes(id, { db, schema, llm: getLLM() }));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
```

- [ ] **Step 7: Verify routes typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add theme, tagging, matrix, and suggestion API routes"
```

---

## Task 8: UI — matrix grid, theme chips, suggestion panel

**Files:**
- Create: `src/app/collections/[id]/matrix/page.tsx`, `src/components/MatrixGrid.tsx`, `src/components/SuggestThemesPanel.tsx`, `src/components/ThemeChips.tsx`
- Modify: `src/components/AnnotationReader.tsx`, `src/app/papers/[id]/page.tsx`

- [ ] **Step 1: Create `src/components/MatrixGrid.tsx`** (pure presentational, server-friendly)

```tsx
import Link from 'next/link';
import type { Matrix } from '@/lib/themes/matrix';

export function MatrixGrid({ matrix }: { matrix: Matrix }) {
  if (matrix.themes.length === 0) return <p>No themes yet. Create themes or use “Suggest themes”.</p>;
  return (
    <table border={1} cellPadding={6} style={{ borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th>Paper</th>
          {matrix.themes.map((t) => <th key={t.id}>{t.name}</th>)}
        </tr>
      </thead>
      <tbody>
        {matrix.papers.map((p) => (
          <tr key={p.id}>
            <td>{p.title ?? 'Untitled'}</td>
            {matrix.themes.map((t) => (
              <td key={t.id} style={{ verticalAlign: 'top', maxWidth: 280 }}>
                {(matrix.cells[p.id]?.[t.id] ?? []).map((cell) => (
                  <div key={cell.id} style={{ marginBottom: 6 }}>
                    <Link href={`/papers/${p.id}`}>“{cell.quote}”</Link>
                    <div style={{ fontSize: 12, color: '#555' }}>{cell.comment}</div>
                  </div>
                ))}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 2: Create `src/components/SuggestThemesPanel.tsx`** (client; suggest → review → apply)

```tsx
'use client';
import { useState } from 'react';

interface Suggestion { themes: string[]; assignments: { annotationId: string; themes: string[] }[] }

export function SuggestThemesPanel({ collectionId }: { collectionId: string }) {
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [status, setStatus] = useState('');

  async function suggest() {
    setStatus('Asking the model…');
    const res = await fetch(`/api/collections/${collectionId}/suggest-themes`, { method: 'POST' });
    if (!res.ok) { setStatus(`Error: ${(await res.json()).error ?? res.status}`); return; }
    setSuggestion(await res.json());
    setStatus('');
  }

  async function apply() {
    if (!suggestion) return;
    setStatus('Applying…');
    // create themes, capturing their ids by name
    const byName = new Map<string, string>();
    for (const name of suggestion.themes) {
      const res = await fetch(`/api/collections/${collectionId}/themes`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }),
      });
      if (res.ok) { const t = await res.json(); byName.set(name, t.id); }
    }
    // tag annotations
    for (const a of suggestion.assignments) {
      for (const name of a.themes) {
        const themeId = byName.get(name);
        if (themeId) {
          await fetch(`/api/annotations/${a.annotationId}/themes`, {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ themeId }),
          });
        }
      }
    }
    setStatus('Applied. Reload the matrix to see the result.');
    setSuggestion(null);
  }

  return (
    <div style={{ margin: '16px 0' }}>
      <button onClick={suggest}>Suggest themes</button> {status}
      {suggestion && (
        <div style={{ background: '#f5f5f5', padding: 12, marginTop: 8 }}>
          <strong>Proposed themes:</strong> {suggestion.themes.join(', ')}
          <p>{suggestion.assignments.length} annotation assignments proposed.</p>
          <button onClick={apply}>Apply</button>
          <button onClick={() => setSuggestion(null)}>Discard</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create `src/app/collections/[id]/matrix/page.tsx`**

```tsx
import { getMatrix } from '@/lib/themes/service';
import { db, schema } from '@/db/client';
import { MatrixGrid } from '@/components/MatrixGrid';
import { SuggestThemesPanel } from '@/components/SuggestThemesPanel';

export default async function MatrixPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const matrix = await getMatrix(id, { db, schema });
  return (
    <main style={{ padding: 40 }}>
      <h1>Literature matrix</h1>
      <SuggestThemesPanel collectionId={id} />
      <MatrixGrid matrix={matrix} />
    </main>
  );
}
```

- [ ] **Step 4: Create `src/components/ThemeChips.tsx`** (client; tag/untag one annotation)

```tsx
'use client';
import { useState } from 'react';

interface Theme { id: string; name: string }

export function ThemeChips({ annotationId, allThemes, initial }: { annotationId: string; allThemes: Theme[]; initial: string[] }) {
  const [tagged, setTagged] = useState<Set<string>>(new Set(initial));

  async function toggle(themeId: string) {
    if (tagged.has(themeId)) {
      await fetch(`/api/annotations/${annotationId}/themes/${themeId}`, { method: 'DELETE' });
      setTagged((s) => { const n = new Set(s); n.delete(themeId); return n; });
    } else {
      const res = await fetch(`/api/annotations/${annotationId}/themes`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ themeId }),
      });
      if (res.ok) setTagged((s) => new Set(s).add(themeId));
    }
  }

  if (allThemes.length === 0) return null;
  return (
    <span style={{ marginLeft: 8 }}>
      {allThemes.map((t) => (
        <button key={t.id} onClick={() => toggle(t.id)} style={{ fontWeight: tagged.has(t.id) ? 700 : 400, marginRight: 4 }}>
          {tagged.has(t.id) ? '●' : '○'} {t.name}
        </button>
      ))}
    </span>
  );
}
```

- [ ] **Step 5: Wire theme chips into the reader — modify `src/components/AnnotationReader.tsx`**

Change the component signature to accept the collection's themes and per-annotation tags, and render `ThemeChips` in the notes list. Replace the existing `export function AnnotationReader(...)` signature line and the notes `<ul>` block:

Signature — replace:
```tsx
export function AnnotationReader({ paperId, fullText, initial }: { paperId: string; fullText: string; initial: Annotation[] }) {
```
with:
```tsx
import { ThemeChips } from '@/components/ThemeChips';

interface Theme { id: string; name: string }

export function AnnotationReader({ paperId, fullText, initial, themes, tagsByAnnotation }: { paperId: string; fullText: string; initial: Annotation[]; themes: Theme[]; tagsByAnnotation: Record<string, string[]> }) {
```

Notes list — replace:
```tsx
        {annotations.map((a) => (
          <li key={a.id}><strong>&ldquo;{a.quote}&rdquo;</strong> — {a.comment}</li>
        ))}
```
with:
```tsx
        {annotations.map((a) => (
          <li key={a.id}>
            <strong>&ldquo;{a.quote}&rdquo;</strong> — {a.comment}
            <ThemeChips annotationId={a.id} allThemes={themes} initial={tagsByAnnotation[a.id] ?? []} />
          </li>
        ))}
```

- [ ] **Step 6: Provide themes + tags from the paper page — modify `src/app/papers/[id]/page.tsx`**

Replace the file body with:
```tsx
import { eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { AnnotationReader } from '@/components/AnnotationReader';

export default async function PaperPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [paper] = await db.select().from(schema.papers).where(eq(schema.papers.id, id));
  if (!paper) return <main style={{ padding: 40 }}>Paper not found.</main>;
  const annotations = await db.select().from(schema.annotations).where(eq(schema.annotations.paperId, id));

  const themes = paper.collectionId
    ? await db.select({ id: schema.themes.id, name: schema.themes.name }).from(schema.themes).where(eq(schema.themes.collectionId, paper.collectionId))
    : [];
  const annotationIds = annotations.map((a) => a.id);
  const tagRows = annotationIds.length
    ? await db.select().from(schema.annotationThemes).where(inArray(schema.annotationThemes.annotationId, annotationIds))
    : [];
  const tagsByAnnotation: Record<string, string[]> = {};
  for (const r of tagRows) (tagsByAnnotation[r.annotationId] ??= []).push(r.themeId);

  return (
    <main style={{ padding: 40 }}>
      <h1>{paper.title ?? 'Untitled paper'}</h1>
      <AnnotationReader paperId={paper.id} fullText={paper.fullText ?? ''} initial={annotations} themes={themes} tagsByAnnotation={tagsByAnnotation} />
    </main>
  );
}
```

- [ ] **Step 7: Verify build and types**

Run: `npx tsc --noEmit && npm run lint`
Expected: tsc no errors; lint exit 0 (warnings allowed).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add matrix grid, theme chips, and suggestion panel UI"
```

---

## Task 9: Full verification and README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Run the entire suite**

Run: `npm test`
Expected: all unit + integration tests PASS.

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Add a section to `README.md`**

Insert before the "## Deploy (Vercel)" heading:
```markdown
## Themes & literature matrix (Phase 3a)
- Create themes within a collection and tag your annotations with them (theme chips appear under each note in the paper reader at `/papers/<id>`).
- View the literature matrix at `/collections/<id>/matrix`: rows are papers, columns are themes, and each cell shows the paper's annotations tagged with that theme (linked back to the source).
- Click “Suggest themes” to have the LLM propose themes and taggings from your annotations. Suggestions are non-destructive — nothing changes until you click Apply.
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: document Phase 3a themes and literature matrix"
```

---

## Self-Review (completed during authoring)

**Spec coverage:**
- `themes` + `annotation_themes` tables → Task 1 ✓
- `LLMProvider.complete()` + OpenAI impl → Task 2 ✓
- Derived matrix via pure `assembleMatrix` → Tasks 3, 5 ✓
- Manual theme CRUD + tagging (idempotent, collection-constrained, cascade) → Tasks 5, 7 ✓
- Non-destructive LLM suggestion (`buildSuggestionPrompt`/`parseSuggestion`/`suggestThemes`, read-only) + separate apply via existing routes → Tasks 4, 6, 8 ✓
- Matrix endpoint + UI; theme chips in reader; suggest-then-apply panel → Tasks 7, 8 ✓
- Auth (requireUser→401) + Zod on all routes → Task 7 ✓
- Error handling: malformed suggestion throws (502 at route), tagging cross-collection → 400, cascade on theme delete → Tasks 4, 5, 7 ✓
- Testing: unit (matrix, suggest), integration (schema, theme service, suggest service), build → Tasks 1–9 ✓

**Type consistency:** `Deps = { db, schema }` for theme service; `SuggestDeps extends Deps { llm }` for `suggestThemes`. `Matrix`/`MatrixPaper`/`MatrixTheme`/`AnnotationCell`/`TaggedAnnotation` defined in Task 3 and consumed by Task 5 (`getMatrix`) and Task 8 (`MatrixGrid`). `ThemeSuggestion` defined in Task 4, used in Task 6. Route param names (`id`, `themeId`) match the folder structure. `assembleMatrix` returns `cells[paperId][themeId]`, matching `MatrixGrid`'s `matrix.cells[p.id]?.[t.id]` access.

**Known thin spots (acceptable for Phase 3a, flagged):**
- The matrix page is server-rendered; after "Apply" in the suggestion panel the user reloads to see new columns (the panel says so). A reactive refresh is a small follow-up.
- Theme rename/delete have routes but no dedicated UI control yet (creation happens via suggestion-apply or a direct POST); a theme-management widget is a minor add.
- `suggestThemes` sends all collection annotations in one prompt; at very large scale this would need batching (noted, not built — fine at team scale).
