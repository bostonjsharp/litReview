# Phase 4c — Reviews on Papers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show "Reviews citing this paper" in the reader, derived automatically from the reviews' annotation entries.

**Architecture:** A derived `reviewsCitingPaper` service (review entries → annotations → reviews, deduped); the paper page passes precomputed review links into `AnnotationReader`, which renders a small section. No schema change.

**Tech Stack:** Next.js App Router, Drizzle/Postgres (Neon), Vitest.

Spec: `docs/superpowers/specs/2026-06-04-phase4c-reviews-on-papers-design.md`

## File map
- `src/lib/reviews/service.ts` — `reviewsCitingPaper` (modify)
- `src/app/workspaces/[id]/(immersive)/papers/[pid]/page.tsx` — query + pass prop (modify)
- `src/components/AnnotationReader.tsx` — `citingReviews` prop + section (modify)
- Test: `tests/integration/reviews-on-papers.test.ts`

---

### Task 1: `reviewsCitingPaper` (TDD)

**Files:** `src/lib/reviews/service.ts`; Test `tests/integration/reviews-on-papers.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { makeTestDb } from '../helpers/testdb';
import { reviewsCitingPaper } from '@/lib/reviews/service';

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => { ctx = await makeTestDb(); });
afterAll(async () => { await ctx.sql.end(); });
function deps() { return { db: ctx.db, schema: ctx.schema }; }

describe('reviewsCitingPaper', () => {
  it('returns reviews citing a note on the paper (deduped), excluding others', async () => {
    const [p1] = await ctx.db.insert(ctx.schema.papers).values({ title: 'P1', status: 'ready' }).returning();
    const [p2] = await ctx.db.insert(ctx.schema.papers).values({ title: 'P2', status: 'ready' }).returning();
    const [a1] = await ctx.db.insert(ctx.schema.annotations).values({ paperId: p1.id, charStart: 0, charEnd: 4, quote: 'x', comment: 'c' }).returning();
    const [a1b] = await ctx.db.insert(ctx.schema.annotations).values({ paperId: p1.id, charStart: 5, charEnd: 9, quote: 'y', comment: 'd' }).returning();
    const [a2] = await ctx.db.insert(ctx.schema.annotations).values({ paperId: p2.id, charStart: 0, charEnd: 4, quote: 'z', comment: 'e' }).returning();
    const [r1] = await ctx.db.insert(ctx.schema.reviews).values({ title: 'R1', status: 'ready' }).returning();
    const [r2] = await ctx.db.insert(ctx.schema.reviews).values({ title: 'R2', status: 'ready' }).returning();
    // r1 cites two different notes on p1 (must dedupe to one review row); r2 cites p2
    await ctx.db.insert(ctx.schema.reviewEntries).values([
      { reviewId: r1.id, position: 0, kind: 'annotation', annotationId: a1.id },
      { reviewId: r1.id, position: 1, kind: 'annotation', annotationId: a1b.id },
      { reviewId: r2.id, position: 0, kind: 'annotation', annotationId: a2.id },
    ]);

    const res = await reviewsCitingPaper(p1.id, deps());
    expect(res.map((r) => r.id)).toEqual([r1.id]);
    expect(res[0].title).toBe('R1');
  });
});
```

- [ ] **Step 2: Run → FAIL** (`npx vitest run tests/integration/reviews-on-papers.test.ts`) — `reviewsCitingPaper` not exported.

- [ ] **Step 3: Implement** — add to `src/lib/reviews/service.ts`:

```ts
// Reviews that draw from a paper — derived from the reviews' annotation entries that cite
// a note on this paper. Deduped by review id; sorted by title for stable display.
export async function reviewsCitingPaper(
  paperId: string,
  deps: Deps,
): Promise<{ id: string; title: string | null; status: string }[]> {
  const { db, schema } = deps;
  const rows = await db
    .selectDistinct({ id: schema.reviews.id, title: schema.reviews.title, status: schema.reviews.status })
    .from(schema.reviewEntries)
    .innerJoin(schema.annotations, eq(schema.reviewEntries.annotationId, schema.annotations.id))
    .innerJoin(schema.reviews, eq(schema.reviewEntries.reviewId, schema.reviews.id))
    .where(eq(schema.annotations.paperId, paperId));
  return [...rows].sort((a: { title: string | null }, b: { title: string | null }) =>
    (a.title ?? '').localeCompare(b.title ?? ''),
  );
}
```
(`eq` is already imported in this file. The inner join on `annotations` via `annotationId` naturally excludes prose entries, whose `annotationId` is null.)

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Commit**

```bash
git add src/lib/reviews/service.ts tests/integration/reviews-on-papers.test.ts
git commit -m "feat(reviews): derive reviewsCitingPaper from annotation entries"
```

---

### Task 2: Surface "Reviews citing this paper" in the reader

**Files:** `src/app/workspaces/[id]/(immersive)/papers/[pid]/page.tsx`; `src/components/AnnotationReader.tsx`

Server-component query + client-component render; verified by `tsc`/`eslint`/`build` + manual.

- [ ] **Step 1: Query + pass the prop from the page**

In `…/papers/[pid]/page.tsx`, import the service and (after the paper is loaded) compute precomputed review links, then pass them to `<AnnotationReader>`:

```ts
import { reviewsCitingPaper } from '@/lib/reviews/service';
```

```ts
  const citing = await reviewsCitingPaper(pid, { db, schema });
  const citingReviews = citing.map((r) => ({
    id: r.id,
    title: r.title,
    href: `/workspaces/${workspaceId}/reviews/${r.id}/edit`,
  }));
```

Add the prop to the rendered element:
```tsx
    <AnnotationReader
      paperId={paper.id}
      collectionId={paper.collectionId}
      citingReviews={citingReviews}
      fullText={paper.fullText ?? ''}
```
(Insert the `citingReviews` line among the existing props.)

- [ ] **Step 2: Accept the prop in `AnnotationReader`**

In `src/components/AnnotationReader.tsx`, add to the `Props` interface:
```ts
  citingReviews?: { id: string; title: string | null; href: string }[];
```
Add it to the destructured params (with a default):
```ts
  citingReviews = [],
```
(`Link` is already imported in this file.)

- [ ] **Step 3: Render the section** — in the reader document, immediately AFTER the DOI block:

```tsx
          {paper.doi && (
            <div className="reader-doi mono">DOI {paper.doi}</div>
          )}

          {citingReviews.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'baseline', marginTop: 10 }}>
              <span className="meta">Reviews citing this paper:</span>
              {citingReviews.map((r) => (
                <Link key={r.id} href={r.href} style={{ fontSize: 13, color: 'var(--accent)' }}>
                  {r.title || 'Untitled review'}
                </Link>
              ))}
            </div>
          )}
```

- [ ] **Step 4: Verify** — `npx tsc --noEmit` (no new src errors) + `npx eslint src/components/AnnotationReader.tsx "src/app/workspaces/[id]/(immersive)/papers/[pid]/page.tsx"`.

- [ ] **Step 5: Manual check** — open a paper that has a note pulled into a review → the "Reviews citing this paper" link appears under the title and opens the review; a paper with no such review shows nothing.

- [ ] **Step 6: Commit**

```bash
git add src/components/AnnotationReader.tsx "src/app/workspaces/[id]/(immersive)/papers/[pid]/page.tsx"
git commit -m "feat(reader): show reviews citing this paper (FEAT-5)"
```

---

### Task 3: Verification + backlog

- [ ] **Step 1: Suite** — `npx vitest run` → green incl. `reviews-on-papers`. No regressions.
- [ ] **Step 2: Typecheck** — `npx tsc --noEmit` → only pre-existing `tests/ui/*` errors.
- [ ] **Step 3: Lint** — `npx eslint src/lib/reviews/service.ts src/components/AnnotationReader.tsx "src/app/workspaces/[id]/(immersive)/papers/[pid]/page.tsx"` → 0 errors.
- [ ] **Step 4: Build** — `npx next build` → succeeds.
- [ ] **Step 5: Backlog** — in `docs/BACKLOG.md`, note FEAT-5's "attach reviews to papers" half is done (the upload-reliability half was done in Phase 1); reviews now surface on the papers they cite. Commit:

```bash
git add docs/BACKLOG.md
git commit -m "docs: mark FEAT-5 attach-reviews-to-papers done (Phase 4c)"
```

---

## Self-Review

**Spec coverage:**
- Derived `reviewsCitingPaper` (entries → annotations → reviews, deduped, sorted) → Task 1 ✓
- Reader section, precomputed hrefs from the page → Task 2 ✓
- No schema change → confirmed ✓
- Test: returns citing review, dedupes, excludes others → Task 1 ✓

**Placeholder scan:** No TBD/TODO; complete code in every code step.

**Type consistency:** `reviewsCitingPaper(paperId, deps): Promise<{id, title, status}[]>` defined in Task 1; the page maps it to `{ id, title, href }` (Task 2 Step 1), which matches the `citingReviews?: { id; title; href }[]` prop added to `AnnotationReader` (Task 2 Step 2) and consumed in Step 3. `Link` already imported in the reader; `eq` already imported in the service.
