# Phase 4a — Reusable Paper Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a paper belong to many collections (a `paper_collections` junction) and add a workspace "Papers" library to reuse papers across collections — with collection reads, the matrix, theme-tagging, and retrieval all honoring membership.

**Architecture:** A `paper_collections` M:N junction (backfilled from `papers.collectionId`, which is kept as a "home" pointer); a small membership service; every "papers in a collection" read switches to the junction; retrieval collection-scope resolves membership; upload writes a junction row; a Papers library page + add/remove UI and API.

**Tech Stack:** Next.js App Router, Drizzle/Postgres (Neon), Vitest (unit + Neon test DB), class-based CSS.

Spec: `docs/superpowers/specs/2026-06-04-phase4a-reusable-papers-design.md`

## File map
- `src/db/schema.ts` — `paperCollections` table (modify)
- `drizzle/0006_*.sql` + meta — generated migration + appended backfill (new)
- `src/lib/papers/collections.ts` — membership service (new)
- `src/app/api/upload/route.ts`, `src/lib/ingest/import-source.ts` (or `/api/import`) — write junction row on create (modify)
- `src/lib/search/retrieve.ts` — collection-scope via membership (modify)
- `src/lib/themes/service.ts` — `getMatrix`/`listCollectionAnnotations`/`tagAnnotation` via membership (modify)
- `src/app/workspaces/[id]/(app)/collections/[cid]/page.tsx` — papers via junction (modify)
- `src/app/workspaces/[id]/(app)/page.tsx` — per-collection counts via junction (modify)
- `src/app/api/papers/[id]/collections/route.ts` (POST) + `[collectionId]/route.ts` (DELETE) — new
- `src/app/workspaces/[id]/(app)/papers/page.tsx` — library page (new)
- `src/components/chrome/Sidebar.tsx` — Papers nav entry (modify)
- `src/components/papers/AddToCollection.tsx` — add/remove control (new)
- Tests: `tests/integration/paper-collections.test.ts`, `tests/integration/retrieve-collection.test.ts`, additions to `tests/integration/theme-service.test.ts`

**Ordering matters:** Task 3 (upload writes a junction row) must land before/with Task 6 (collection reads switch to the junction), or newly-uploaded papers would vanish from their collection. The backfill (Task 1) covers existing papers.

---

### Task 1: `paper_collections` schema + migration + backfill

**Files:** `src/db/schema.ts`; generated `drizzle/0006_*.sql`

- [ ] **Step 1: Add the table** — append after `annotationThemes` in `src/db/schema.ts`:

```ts
export const paperCollections = pgTable(
  'paper_collections',
  {
    paperId: uuid('paper_id').notNull().references(() => papers.id, { onDelete: 'cascade' }),
    collectionId: uuid('collection_id').notNull().references(() => collections.id, { onDelete: 'cascade' }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.paperId, t.collectionId] }) }),
);
```

- [ ] **Step 2: Generate the migration** — `npm run db:gen` → creates `drizzle/0006_*.sql` with `CREATE TABLE "paper_collections"`. Confirm it only adds that table.

- [ ] **Step 3: Append the backfill** to the generated `drizzle/0006_*.sql` (so existing memberships are preserved):

```sql
--> statement-breakpoint
INSERT INTO "paper_collections" ("paper_id", "collection_id")
SELECT "id", "collection_id" FROM "papers"
WHERE "collection_id" IS NOT NULL
ON CONFLICT DO NOTHING;
```

- [ ] **Step 4: Apply** — `npm run db:migrate` → applies cleanly. `npx tsc --noEmit` → no new `src/` errors.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts drizzle/
git commit -m "feat(papers): add paper_collections junction + backfill from collectionId"
```

---

### Task 2: Membership service (TDD)

**Files:** Create `src/lib/papers/collections.ts`; Test `tests/integration/paper-collections.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { makeTestDb } from '../helpers/testdb';
import {
  addPaperToCollection, removePaperFromCollection, collectionPaperIds,
  paperCollectionIds, isPaperInCollection, listWorkspacePapers,
} from '@/lib/papers/collections';

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => { ctx = await makeTestDb(); });
afterAll(async () => { await ctx.sql.end(); });
function deps() { return { db: ctx.db, schema: ctx.schema }; }

async function seed() {
  const [w] = await ctx.db.insert(ctx.schema.workspaces).values({ name: 'W', inviteCode: `c${Math.random()}` }).returning();
  const [a] = await ctx.db.insert(ctx.schema.collections).values({ name: 'A', workspaceId: w.id }).returning();
  const [b] = await ctx.db.insert(ctx.schema.collections).values({ name: 'B', workspaceId: w.id }).returning();
  const [p] = await ctx.db.insert(ctx.schema.papers).values({ title: 'P', status: 'ready', workspaceId: w.id }).returning();
  return { w, a, b, p };
}

describe('paper-collections membership', () => {
  it('adds idempotently and reports membership both ways', async () => {
    const { a, b, p } = await seed();
    await addPaperToCollection(p.id, a.id, deps());
    await addPaperToCollection(p.id, a.id, deps()); // idempotent — no throw
    await addPaperToCollection(p.id, b.id, deps());
    expect((await paperCollectionIds(p.id, deps())).sort()).toEqual([a.id, b.id].sort());
    expect(await collectionPaperIds(a.id, deps())).toContain(p.id);
    expect(await isPaperInCollection(p.id, b.id, deps())).toBe(true);
  });

  it('removes a link without deleting the paper', async () => {
    const { a, p } = await seed();
    await addPaperToCollection(p.id, a.id, deps());
    await removePaperFromCollection(p.id, a.id, deps());
    expect(await isPaperInCollection(p.id, a.id, deps())).toBe(false);
    // the paper row still exists (unlink ≠ delete):
    const rows = await ctx.db.select().from(ctx.schema.papers);
    expect(rows.some((r: { id: string }) => r.id === p.id)).toBe(true);
  });

  it('lists workspace papers with their collection ids', async () => {
    const { w, a, p } = await seed();
    await addPaperToCollection(p.id, a.id, deps());
    const list = await listWorkspacePapers(w.id, deps());
    const found = list.find((x: any) => x.id === p.id);
    expect(found).toBeTruthy();
    expect(found.collectionIds).toContain(a.id);
  });
});
```

- [ ] **Step 2: Run → FAIL** (`npx vitest run tests/integration/paper-collections.test.ts`) — module missing.

- [ ] **Step 3: Implement** `src/lib/papers/collections.ts`:

```ts
import { and, eq, inArray } from 'drizzle-orm';

interface Deps {
  db: any;
  schema: any;
}

export async function addPaperToCollection(paperId: string, collectionId: string, deps: Deps) {
  await deps.db.insert(deps.schema.paperCollections).values({ paperId, collectionId }).onConflictDoNothing();
}

export async function removePaperFromCollection(paperId: string, collectionId: string, deps: Deps) {
  const { db, schema } = deps;
  await db.delete(schema.paperCollections).where(
    and(eq(schema.paperCollections.paperId, paperId), eq(schema.paperCollections.collectionId, collectionId)),
  );
}

export async function collectionPaperIds(collectionId: string, deps: Deps): Promise<string[]> {
  const { db, schema } = deps;
  const rows = await db.select({ paperId: schema.paperCollections.paperId })
    .from(schema.paperCollections).where(eq(schema.paperCollections.collectionId, collectionId));
  return rows.map((r: { paperId: string }) => r.paperId);
}

export async function paperCollectionIds(paperId: string, deps: Deps): Promise<string[]> {
  const { db, schema } = deps;
  const rows = await db.select({ collectionId: schema.paperCollections.collectionId })
    .from(schema.paperCollections).where(eq(schema.paperCollections.paperId, paperId));
  return rows.map((r: { collectionId: string }) => r.collectionId);
}

export async function isPaperInCollection(paperId: string, collectionId: string, deps: Deps): Promise<boolean> {
  const { db, schema } = deps;
  const [row] = await db.select().from(schema.paperCollections).where(
    and(eq(schema.paperCollections.paperId, paperId), eq(schema.paperCollections.collectionId, collectionId)),
  );
  return !!row;
}

// Every paper in the workspace plus the collection ids it belongs to.
export async function listWorkspacePapers(workspaceId: string, deps: Deps) {
  const { db, schema } = deps;
  const papers = await db.select().from(schema.papers).where(eq(schema.papers.workspaceId, workspaceId));
  const ids = papers.map((p: { id: string }) => p.id);
  const links = ids.length
    ? await db.select({ paperId: schema.paperCollections.paperId, collectionId: schema.paperCollections.collectionId })
        .from(schema.paperCollections).where(inArray(schema.paperCollections.paperId, ids))
    : [];
  const byPaper: Record<string, string[]> = {};
  for (const l of links) (byPaper[l.paperId] ??= []).push(l.collectionId);
  return papers.map((p: { id: string }) => ({ ...p, collectionIds: byPaper[p.id] ?? [] }));
}
```

- [ ] **Step 4: Run → PASS** (`npx vitest run tests/integration/paper-collections.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/papers/collections.ts tests/integration/paper-collections.test.ts
git commit -m "feat(papers): add paper-collections membership service"
```

---

### Task 3: Upload/import write a junction row on paper create

**Files:** `src/app/api/upload/route.ts`; `src/app/api/import/route.ts` (and/or `src/lib/ingest/import-source.ts` — wherever a paper row is inserted with a collectionId)

- [ ] **Step 1: Upload route** — after the paper row is inserted (the `const [row] = await db.insert(table)…` for `kind === 'paper'`), add a junction row when there's a collection. Insert right after the row is created:

```ts
  if (kind === 'paper' && collectionId) {
    await db.insert(schema.paperCollections).values({ paperId: row.id, collectionId }).onConflictDoNothing();
  }
```

- [ ] **Step 2: Import route** — locate where the imported paper row is inserted with a `collectionId` (in `/api/import/route.ts` or `lib/ingest/import-source.ts`) and add the same junction insert for the new paper id + collectionId (use `schema.paperCollections` + `onConflictDoNothing`). If import goes through a shared create path, add it once there.

- [ ] **Step 3: Verify** — `npx tsc --noEmit` (no new src errors) and `npx eslint "src/app/api/upload/route.ts" "src/app/api/import/route.ts"` (0 errors).

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/upload/route.ts" "src/app/api/import/route.ts" src/lib/ingest/import-source.ts
git commit -m "feat(papers): record paper_collections membership on upload/import"
```

---

### Task 4: Retrieval collection-scope via membership (TDD)

**Files:** `src/lib/search/retrieve.ts`; Test `tests/integration/retrieve-collection.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { makeTestDb } from '../helpers/testdb';
import { retrieve } from '@/lib/search/retrieve';
import { addPaperToCollection } from '@/lib/papers/collections';

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => { ctx = await makeTestDb(); });
afterAll(async () => { await ctx.sql.end(); });
const fakeLLM = (v: number[]) => ({ embed: vi.fn(async () => [v]), chat: vi.fn() } as any);

it('collection scope includes a paper reused into that collection', async () => {
  const [w] = await ctx.db.insert(ctx.schema.workspaces).values({ name: 'W', inviteCode: `c${Math.random()}` }).returning();
  const [a] = await ctx.db.insert(ctx.schema.collections).values({ name: 'A', workspaceId: w.id }).returning();
  const [b] = await ctx.db.insert(ctx.schema.collections).values({ name: 'B', workspaceId: w.id }).returning();
  const [p] = await ctx.db.insert(ctx.schema.papers).values({ title: 'P', status: 'ready', workspaceId: w.id, collectionId: a.id }).returning();
  // chunk's stored collectionId is A (origin), but we reuse the paper into B:
  const vec = Array(1536).fill(0); vec[5] = 1;
  await ctx.db.insert(ctx.schema.chunks).values({
    parentType: 'paper', parentId: p.id, collectionId: a.id, workspaceId: w.id,
    chunkIndex: 0, text: 'reused', embedding: vec, charStart: 0, charEnd: 6,
  });
  await addPaperToCollection(p.id, a.id, { db: ctx.db, schema: ctx.schema });
  await addPaperToCollection(p.id, b.id, { db: ctx.db, schema: ctx.schema });

  const res = await retrieve('q', fakeLLM(vec), ctx.db, { scope: { collectionId: b.id }, k: 5, schema: ctx.schema });
  expect(res.map((r) => r.id)).toContain(/* the chunk is returned under collection B */ res[0]?.id);
  expect(res.some((r) => r.text === 'reused')).toBe(true);
});
```

- [ ] **Step 2: Run → FAIL** — today the collection filter is `eq(chunks.collectionId, B)`, and the chunk's `collectionId` is A, so it isn't returned under B.

- [ ] **Step 3: Implement** — in `src/lib/search/retrieve.ts`:

Extend the imports:
```ts
import { sql, and, or, eq, inArray } from 'drizzle-orm';
```

Replace the collection-scope condition. Remove:
```ts
  if (opts.scope?.collectionId) conds.push(eq(schema.chunks.collectionId, opts.scope.collectionId));
```
and insert (after the workspace condition, before building `where`):
```ts
  if (opts.scope?.collectionId) {
    const cid = opts.scope.collectionId;
    const paperRows = await db.select({ paperId: schema.paperCollections.paperId })
      .from(schema.paperCollections).where(eq(schema.paperCollections.collectionId, cid));
    const paperIds = paperRows.map((r: { paperId: string }) => r.paperId);
    const reviewRows = await db.select({ id: schema.reviews.id })
      .from(schema.reviews).where(eq(schema.reviews.collectionId, cid));
    const reviewIds = reviewRows.map((r: { id: string }) => r.id);
    const annRows = paperIds.length
      ? await db.select({ id: schema.annotations.id })
          .from(schema.annotations).where(inArray(schema.annotations.paperId, paperIds))
      : [];
    const annIds = annRows.map((r: { id: string }) => r.id);
    const branches = [];
    if (paperIds.length) branches.push(and(eq(schema.chunks.parentType, 'paper'), inArray(schema.chunks.parentId, paperIds)));
    if (reviewIds.length) branches.push(and(eq(schema.chunks.parentType, 'review'), inArray(schema.chunks.parentId, reviewIds)));
    if (annIds.length) branches.push(and(eq(schema.chunks.parentType, 'annotation'), inArray(schema.chunks.parentId, annIds)));
    if (branches.length === 0) return []; // collection has nothing to search
    conds.push(or(...branches));
  }
```

- [ ] **Step 4: Run → PASS.** Also `npx vitest run tests/integration/retrieve.test.ts tests/integration/retrieve-rewrite.test.ts` → still PASS (workspace/paper scopes and default-k unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/lib/search/retrieve.ts tests/integration/retrieve-collection.test.ts
git commit -m "feat(search): resolve collection scope through paper_collections membership"
```

---

### Task 5: Theme service membership (getMatrix, listCollectionAnnotations, tagAnnotation) (TDD)

**Files:** `src/lib/themes/service.ts`; Test: add a case to `tests/integration/theme-service.test.ts`

- [ ] **Step 1: Write the failing test** — append to `tests/integration/theme-service.test.ts` a case proving a **reused** paper's annotation can be tagged in the new collection and shows in its matrix. Use the existing test's helpers/imports; the shape:

```ts
it('a reused paper can be tagged and matrixed in the collection it was added to', async () => {
  // seed workspace + collection B + a paper whose HOME collectionId is some other collection A
  // link the paper into B via addPaperToCollection (import it at top from '@/lib/papers/collections')
  // create a theme in B, an annotation on the paper, then tagAnnotation(ann, theme)
  // expect getMatrix(B) to include the paper and the tagged cell
  // (Mirror the seeding already used in this file; assert no "different collections" throw.)
});
```

(Write it concretely against this file's existing seeding utilities — the key assertions: `tagAnnotation` does NOT throw for a reused paper, and `getMatrix(B).papers` contains the paper id.)

- [ ] **Step 2: Run → FAIL** — `tagAnnotation` throws "theme and annotation are in different collections" (it compares `paper.collectionId` to the theme's collection), and `getMatrix` lists papers by `papers.collectionId`, so the reused paper is absent.

- [ ] **Step 3: Implement** — in `src/lib/themes/service.ts`:

Import the membership helpers at the top:
```ts
import { collectionPaperIds, isPaperInCollection } from '../papers/collections';
```

`getMatrix` — replace the papers query (membership, not home):
```ts
  const paperIds = await collectionPaperIds(collectionId, { db, schema });
  const rawPapers = paperIds.length
    ? await db
        .select({ id: schema.papers.id, title: schema.papers.title, authors: schema.papers.authors, year: schema.papers.year })
        .from(schema.papers)
        .where(inArray(schema.papers.id, paperIds))
    : [];
```
(`inArray` is already imported in this file.)

`listCollectionAnnotations` — replace the `papers.collectionId` join with membership:
```ts
export async function listCollectionAnnotations(collectionId: string, deps: Deps) {
  const { db, schema } = deps;
  const paperIds = await collectionPaperIds(collectionId, deps);
  if (paperIds.length === 0) return [];
  return db
    .select({ annotationId: schema.annotations.id, quote: schema.annotations.quote, comment: schema.annotations.comment })
    .from(schema.annotations)
    .where(inArray(schema.annotations.paperId, paperIds));
}
```

`tagAnnotation` — replace the `paper.collectionId !== theme.collectionId` check with a membership check:
```ts
  const [theme] = await db
    .select({ collectionId: schema.themes.collectionId })
    .from(schema.themes)
    .where(eq(schema.themes.id, themeId));
  if (!theme) throw new Error('theme not found');
  if (!(await isPaperInCollection(ann.paperId, theme.collectionId, deps))) {
    throw new Error('theme and annotation are in different collections');
  }
```
(Drop the now-unused `paper` lookup in `tagAnnotation`.)

- [ ] **Step 4: Run → PASS** (`npx vitest run tests/integration/theme-service.test.ts`); also run `tests/integration/suggest-themes.test.ts` if present → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/themes/service.ts tests/integration/theme-service.test.ts
git commit -m "feat(themes): matrix, suggest, and tagging honor paper_collections membership"
```

---

### Task 6: Collection page + dashboard reads switch to the junction

**Files:** `src/app/workspaces/[id]/(app)/collections/[cid]/page.tsx`; `src/app/workspaces/[id]/(app)/page.tsx`

Server components; verified by `tsc`/`eslint`/`build`.

- [ ] **Step 1: Collection page** — replace the papers query

```ts
  const papers = await db
    .select()
    .from(schema.papers)
    .where(eq(schema.papers.collectionId, cid));
```
with a junction join:
```ts
  const papers = await db
    .select()
    .from(schema.papers)
    .innerJoin(schema.paperCollections, eq(schema.paperCollections.paperId, schema.papers.id))
    .where(eq(schema.paperCollections.collectionId, cid));
```
**Important:** an `innerJoin` makes each row `{ papers: {...}, paper_collections: {...} }`. Either select explicit columns, or map `papers.map((r) => r.papers)` immediately after. Use the explicit form to keep the rest of the page unchanged:
```ts
  const paperRows = await db
    .select({ p: schema.papers })
    .from(schema.papers)
    .innerJoin(schema.paperCollections, eq(schema.paperCollections.paperId, schema.papers.id))
    .where(eq(schema.paperCollections.collectionId, cid));
  const papers = paperRows.map((r: { p: typeof schema.papers.$inferSelect }) => r.p);
```

- [ ] **Step 2: Dashboard** — replace the per-collection paper count query (the `paperRows` branch counting `papers WHERE collectionId IN …`) with a junction count:
```ts
    collectionIds.length > 0
      ? db
          .select({
            collectionId: schema.paperCollections.collectionId,
            cnt: sql<number>`count(*)::int`,
          })
          .from(schema.paperCollections)
          .where(inArray(schema.paperCollections.collectionId, collectionIds))
          .groupBy(schema.paperCollections.collectionId)
      : Promise.resolve([]),
```
(The `totalPapers` workspace stat stays `papers WHERE workspaceId` — that's a true count, not membership.)

- [ ] **Step 3: Verify** — `npx tsc --noEmit` (no new src errors), `npx eslint` the two files (0 errors).

- [ ] **Step 4: Manual check** — a collection still lists its papers; a paper added to two collections appears in both; dashboard counts match.

- [ ] **Step 5: Commit**

```bash
git add "src/app/workspaces/[id]/(app)/collections/[cid]/page.tsx" "src/app/workspaces/[id]/(app)/page.tsx"
git commit -m "feat(papers): collection page and dashboard count papers via membership"
```

---

### Task 7: Link/unlink API routes

**Files:** Create `src/app/api/papers/[id]/collections/route.ts` (POST) and `src/app/api/papers/[id]/collections/[collectionId]/route.ts` (DELETE)

- [ ] **Step 1: POST (add)** — `src/app/api/papers/[id]/collections/route.ts`:

```ts
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { requireUser, requireMember } from '@/lib/session';
import { addPaperToCollection } from '@/lib/papers/collections';

const Body = z.object({ collectionId: z.string().uuid() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  const { collectionId } = Body.parse(await req.json());
  const [paper] = await db.select({ workspaceId: schema.papers.workspaceId }).from(schema.papers).where(eq(schema.papers.id, id));
  const [collection] = await db.select({ workspaceId: schema.collections.workspaceId }).from(schema.collections).where(eq(schema.collections.id, collectionId));
  if (!paper || !collection) return new Response('Not found', { status: 404 });
  if (!paper.workspaceId || paper.workspaceId !== collection.workspaceId) return new Response('Forbidden', { status: 403 });
  if (!(await requireMember(paper.workspaceId, user.id))) return new Response('Forbidden', { status: 403 });
  await addPaperToCollection(id, collectionId, { db, schema });
  return new Response(null, { status: 204 });
}
```

- [ ] **Step 2: DELETE (remove)** — `src/app/api/papers/[id]/collections/[collectionId]/route.ts`:

```ts
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { requireUser, requireMember } from '@/lib/session';
import { removePaperFromCollection } from '@/lib/papers/collections';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; collectionId: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id, collectionId } = await params;
  const [paper] = await db.select({ workspaceId: schema.papers.workspaceId }).from(schema.papers).where(eq(schema.papers.id, id));
  if (!paper?.workspaceId) return new Response('Not found', { status: 404 });
  if (!(await requireMember(paper.workspaceId, user.id))) return new Response('Forbidden', { status: 403 });
  await removePaperFromCollection(id, collectionId, { db, schema });
  return new Response(null, { status: 204 });
}
```

- [ ] **Step 3: Verify** — `npx tsc --noEmit` + `npx eslint "src/app/api/papers/[id]/collections"` (0 errors).

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/papers/[id]/collections"
git commit -m "feat(papers): add/remove a paper's collection membership API"
```

---

### Task 8: `AddToCollection` control + Papers library page + sidebar

**Files:** Create `src/components/papers/AddToCollection.tsx`; create `src/app/workspaces/[id]/(app)/papers/page.tsx`; modify `src/components/chrome/Sidebar.tsx`

- [ ] **Step 1: `AddToCollection` client component** — a small menu to add the paper to a collection it isn't in yet (refreshes the route on success):

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';

export function AddToCollection({
  paperId,
  collections,
  memberOf,
}: {
  paperId: string;
  collections: { id: string; name: string }[];
  memberOf: string[];
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const available = collections.filter((c) => !memberOf.includes(c.id));

  async function add(collectionId: string) {
    setBusy(true);
    await fetch(`/api/papers/${paperId}/collections`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ collectionId }),
    });
    setBusy(false);
    setOpen(false);
    router.refresh();
  }

  if (available.length === 0) return null;
  return (
    <span style={{ position: 'relative' }}>
      <button className="btn btn-quiet btn-sm" onClick={() => setOpen((o) => !o)} disabled={busy}>
        <Icon name="plus" size={13} /> Add to collection
      </button>
      {open && (
        <>
          <div className="menu-scrim" onClick={() => setOpen(false)} />
          <div className="theme-pop fade-enter" style={{ top: 30, right: 0 }}>
            {available.map((c) => (
              <button key={c.id} onClick={() => add(c.id)} disabled={busy}>
                <span className="tp-dot" /> {c.name}
              </button>
            ))}
          </div>
        </>
      )}
    </span>
  );
}
```

- [ ] **Step 2: Papers library page** — `src/app/workspaces/[id]/(app)/papers/page.tsx` (server component):

```tsx
import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { listWorkspacePapers } from '@/lib/papers/collections';
import { PageHead } from '@/components/ui/PageHead';
import { Icon } from '@/components/ui/Icon';
import { AddToCollection } from '@/components/papers/AddToCollection';

export default async function PapersLibrary({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [papers, collections] = await Promise.all([
    listWorkspacePapers(id, { db, schema }),
    db.select({ id: schema.collections.id, name: schema.collections.name }).from(schema.collections).where(eq(schema.collections.workspaceId, id)),
  ]);
  const nameById: Record<string, string> = Object.fromEntries(collections.map((c: { id: string; name: string }) => [c.id, c.name]));

  return (
    <>
      <PageHead eyebrow="Workspace" title="Papers">
        <Link href={`/workspaces/${id}/upload`} className="btn btn-primary"><Icon name="plus" /> Add paper</Link>
      </PageHead>
      <div className="card list-card">
        {papers.length === 0 && <div className="paper-row"><span className="meta" style={{ padding: '8px 0' }}>No papers yet.</span></div>}
        {papers.map((p: { id: string; title: string | null; status: string; collectionIds: string[] }) => {
          const ready = p.status === 'ready';
          return (
            <div className="paper-row" key={p.id}>
              <div className="placeholder paper-thumb" />
              <div className="paper-main" style={{ flex: 1, minWidth: 0 }}>
                <div className="paper-title">
                  {ready ? <Link href={`/workspaces/${id}/papers/${p.id}`}>{p.title || 'Untitled'}</Link> : (p.title || 'Untitled')}
                </div>
                <div className="paper-meta">
                  <span className="meta">
                    {p.collectionIds.length === 0 ? 'In no collection' : p.collectionIds.map((cid) => nameById[cid]).filter(Boolean).join(', ')}
                  </span>
                </div>
              </div>
              <AddToCollection paperId={p.id} collections={collections} memberOf={p.collectionIds} />
            </div>
          );
        })}
      </div>
    </>
  );
}
```

- [ ] **Step 3: Sidebar** — add a Papers entry. In `src/components/chrome/Sidebar.tsx`, add to the `nav` array after Collections:

```ts
    { href: `${base}/papers`, icon: "book", label: "Papers", match: (p: string) => p.endsWith("/papers") },
```

- [ ] **Step 4: Verify** — `npx tsc --noEmit` (no new src errors) and `npx eslint` the three files (0 errors).

- [ ] **Step 5: Manual check** — the sidebar shows **Papers**; the library lists every workspace paper with its collections; "Add to collection" adds it and the list refreshes; the paper now appears on that collection's page and matrix.

- [ ] **Step 6: Commit**

```bash
git add src/components/papers/AddToCollection.tsx "src/app/workspaces/[id]/(app)/papers/page.tsx" src/components/chrome/Sidebar.tsx
git commit -m "feat(papers): Papers library page + add-to-collection control + sidebar entry"
```

---

### Task 9: Full verification + backlog

- [ ] **Step 1: Full suite** — `npx vitest run` → all green, incl. `paper-collections`, `retrieve-collection`, and the new theme-service case. No regressions.
- [ ] **Step 2: Typecheck** — `npx tsc --noEmit` → only the pre-existing `tests/ui/*` errors (23 baseline); zero new in `src/`.
- [ ] **Step 3: Lint** — `npx eslint src/lib/papers src/lib/search/retrieve.ts src/lib/themes/service.ts src/components/papers "src/app/api/papers" "src/app/workspaces/[id]/(app)/papers/page.tsx"` → 0 errors.
- [ ] **Step 4: Build** — `npx next build` → succeeds; routes include `/workspaces/[id]/papers` and `/api/papers/[id]/collections`.
- [ ] **Step 5: Backlog** — mark FEAT-3 done in `docs/BACKLOG.md` (paper_collections M:N, library page, membership-aware reads/retrieval/themes). Also note FEAT-3's "Papers tab" goal is met. Commit:

```bash
git add docs/BACKLOG.md
git commit -m "docs: mark FEAT-3 done (Phase 4a reusable papers)"
```

---

## Self-Review

**Spec coverage:**
- `paper_collections` junction + backfill, keep `collectionId` as home → Task 1 ✓
- Membership service → Task 2 ✓
- Upload/import write junction (ordering before read-switch) → Task 3 ✓
- Retrieval collection-scope via membership (reused-paper test) → Task 4 ✓
- Matrix/suggest/tagging via membership → Task 5 ✓
- Collection page + dashboard reads via junction → Task 6 ✓
- Link/unlink API (workspace-guarded, unlink≠delete) → Task 7 ✓
- Papers library + add-to-collection UI + sidebar → Task 8 ✓
- Papers can be in 0..N collections (library shows "In no collection") → Task 8 ✓
- Tests: membership, reused-paper retrieval, reused-paper tagging/matrix → Tasks 2,4,5 ✓

**Placeholder scan:** Task 5 Step 1 describes the test against "this file's existing seeding utilities" rather than pasting a full block — acceptable because it must match `theme-service.test.ts`'s existing setup, which the implementer will read; the assertions are spelled out. The migration filename is a glob because Drizzle names it. All other code steps are complete.

**Type consistency:** `Deps = { db, schema }` across the membership service and consumers. `collectionPaperIds`/`isPaperInCollection` signatures match their use in `retrieve.ts` (Task 4) and `themes/service.ts` (Task 5). `listWorkspacePapers` returns `{...paper, collectionIds: string[] }`, consumed by the library page (Task 8) and tested in Task 2. `addPaperToCollection(paperId, collectionId, deps)` matches upload (Task 3) and the POST route (Task 7). `paperCollections` (camel) is the schema export for the `paper_collections` table used everywhere.

**Ordering guard:** Task 3 (upload writes junction) is sequenced before Task 6 (reads switch to junction); the Task 1 backfill covers pre-existing papers — so no paper is ever dropped from its collection during the rollout.
