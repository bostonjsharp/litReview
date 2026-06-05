# Phase 4b — Publish & Export Reviews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make reviews real and shippable — persist prose + title, publish (finalize in-workspace), export to markdown, and print the read view to PDF.

**Architecture:** A pure `reviewToMarkdown`; an `updateProseEntry` service + an extended entries PATCH; a new `PATCH /api/reviews/[id]` for title/status; a `'published'` status; and composer wiring (debounced prose/title saves, Publish, Export) + print CSS. **No DB migration.**

**Tech Stack:** Next.js App Router, Drizzle/Postgres (Neon), Vitest, class-based CSS.

Spec: `docs/superpowers/specs/2026-06-04-phase4b-publish-reviews-design.md`

## File map
- `src/lib/reviews/export.ts` — `reviewToMarkdown` (new)
- `src/lib/reviews/service.ts` — `updateProseEntry` (modify)
- `src/app/api/reviews/[id]/entries/[entryId]/route.ts` — PATCH accepts `{ prose }` (modify)
- `src/app/api/reviews/[id]/route.ts` — add PATCH `{ title?, status? }` (modify)
- `src/db/schema.ts` — add `'published'` to `statusValues` (modify)
- `src/components/ui/StatusBadge.tsx` — `published` MAP entry (modify)
- `src/components/ReviewComposer.tsx` — debounced prose/title saves, Publish, Export (modify)
- `src/app/workspaces/[id]/(immersive)/reviews/[rid]/edit/page.tsx` — pass `status` into ComposerMeta (modify)
- `src/app/styles/screens.css` — `@media print` (modify)
- Tests: `tests/unit/review-export.test.ts`, addition to `tests/integration/review-compose.test.ts`

---

### Task 1: `reviewToMarkdown` (TDD)

**Files:** Create `src/lib/reviews/export.ts`; Test `tests/unit/review-export.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { reviewToMarkdown } from '@/lib/reviews/export';

const ann = { a1: { quote: 'Attention is key', page: 3, sourceLabel: 'Vaswani · 2017' } };

describe('reviewToMarkdown', () => {
  it('renders title, prose, and an annotation blockquote in position order', () => {
    const md = reviewToMarkdown(
      'My Review',
      [
        { position: 1, kind: 'annotation', prose: null, annotationId: 'a1' },
        { position: 0, kind: 'prose', prose: 'Opening thoughts.', annotationId: null },
      ],
      ann,
    );
    expect(md).toBe('# My Review\n\nOpening thoughts.\n\n> "Attention is key" — Vaswani · 2017 · p.3\n');
  });
  it('skips empty prose and unknown annotations; falls back to Untitled', () => {
    const md = reviewToMarkdown('  ', [
      { position: 0, kind: 'prose', prose: '   ', annotationId: null },
      { position: 1, kind: 'annotation', prose: null, annotationId: 'missing' },
    ], ann);
    expect(md).toBe('# Untitled review\n');
  });
  it('omits the page when null', () => {
    const md = reviewToMarkdown('T', [{ position: 0, kind: 'annotation', prose: null, annotationId: 'a1' }], { a1: { quote: 'q', page: null, sourceLabel: 'Src' } });
    expect(md).toBe('# T\n\n> "q" — Src\n');
  });
});
```

- [ ] **Step 2: Run → FAIL** (`npx vitest run tests/unit/review-export.test.ts`) — module missing.

- [ ] **Step 3: Implement** `src/lib/reviews/export.ts`:

```ts
export interface ExportEntry {
  position: number;
  kind: 'prose' | 'annotation';
  prose: string | null;
  annotationId: string | null;
}
export interface ExportAnn {
  quote: string;
  page: number | null;
  sourceLabel: string;
}

// Renders a review's ordered blocks to markdown: a title heading, prose paragraphs, and
// annotation entries as blockquotes with their source. Empty prose and unknown
// annotations are skipped. Deterministic — safe to unit-test and to build downloads from.
export function reviewToMarkdown(
  title: string,
  entries: ExportEntry[],
  annLookup: Record<string, ExportAnn>,
): string {
  const lines: string[] = [`# ${title.trim() || 'Untitled review'}`, ''];
  for (const e of [...entries].sort((a, b) => a.position - b.position)) {
    if (e.kind === 'prose') {
      const text = (e.prose ?? '').trim();
      if (text) lines.push(text, '');
    } else if (e.kind === 'annotation' && e.annotationId) {
      const a = annLookup[e.annotationId];
      if (a) {
        const src = a.page != null ? `${a.sourceLabel} · p.${a.page}` : a.sourceLabel;
        lines.push(`> "${a.quote}" — ${src}`, '');
      }
    }
  }
  return lines.join('\n').trimEnd() + '\n';
}
```

- [ ] **Step 4: Run → PASS** (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/reviews/export.ts tests/unit/review-export.test.ts
git commit -m "feat(reviews): add reviewToMarkdown exporter"
```

---

### Task 2: Persist prose edits — `updateProseEntry` + PATCH route (TDD)

**Files:** `src/lib/reviews/service.ts`; `src/app/api/reviews/[id]/entries/[entryId]/route.ts`; Test: `tests/integration/review-compose.test.ts`

- [ ] **Step 1: Write the failing test** — append to `tests/integration/review-compose.test.ts` (mirror its existing setup/imports; add `updateProseEntry` to the `@/lib/reviews/service` import):

```ts
it('updateProseEntry persists new prose text', async () => {
  // seed a review (reuse this file's helper); add a prose entry, update it, read it back
  const [r] = await ctx.db.insert(ctx.schema.reviews).values({ title: 'R', status: 'ready' }).returning();
  const entry = await addProseEntry(r.id, 'first', { db: ctx.db, schema: ctx.schema });
  await updateProseEntry(entry.id, 'edited text', { db: ctx.db, schema: ctx.schema });
  const entries = await getReviewEntries(r.id, { db: ctx.db, schema: ctx.schema });
  expect(entries.find((e) => e.id === entry.id)?.prose).toBe('edited text');
});
```

(If `review-compose.test.ts` doesn't already import `addProseEntry`/`getReviewEntries`, add them to its `@/lib/reviews/service` import.)

- [ ] **Step 2: Run → FAIL** — `updateProseEntry` not exported.

- [ ] **Step 3: Implement** — add to `src/lib/reviews/service.ts`:

```ts
export async function updateProseEntry(entryId: string, prose: string, deps: Deps) {
  await deps.db
    .update(deps.schema.reviewEntries)
    .set({ prose })
    .where(eq(deps.schema.reviewEntries.id, entryId));
}
```

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Extend the entries PATCH route** — `src/app/api/reviews/[id]/entries/[entryId]/route.ts`:

```ts
import { z } from 'zod';
import { db, schema } from '@/db/client';
import { requireUser } from '@/lib/session';
import { moveEntry, removeEntry, updateProseEntry } from '@/lib/reviews/service';

const Patch = z.union([
  z.object({ direction: z.enum(['up', 'down']) }),
  z.object({ prose: z.string() }),
]);

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; entryId: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id, entryId } = await params;
  const body = Patch.parse(await req.json());
  if ('direction' in body) await moveEntry(id, entryId, body.direction, { db, schema });
  else await updateProseEntry(entryId, body.prose, { db, schema });
  return Response.json({ ok: true });
}
```
(Leave the existing `DELETE` handler unchanged below it.)

- [ ] **Step 6: Verify** — `npx tsc --noEmit` (no new src errors) + `npx eslint "src/app/api/reviews/[id]/entries/[entryId]/route.ts" src/lib/reviews/service.ts`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/reviews/service.ts "src/app/api/reviews/[id]/entries/[entryId]/route.ts" tests/integration/review-compose.test.ts
git commit -m "feat(reviews): persist prose-block edits (updateProseEntry + PATCH prose)"
```

---

### Task 3: PATCH review (title/status) + `'published'` status + badge

**Files:** `src/app/api/reviews/[id]/route.ts`; `src/db/schema.ts`; `src/components/ui/StatusBadge.tsx`

- [ ] **Step 1: Add `'published'` to `statusValues`** — `src/db/schema.ts`:

```ts
export const statusValues = ['pending', 'processing', 'ready', 'failed', 'metadata_only', 'published'] as const;
```
(No migration — `reviews.status` is a `text(..., { enum })` column; the enum is TS-only.)

- [ ] **Step 2: Add a `published` badge** — `src/components/ui/StatusBadge.tsx`, add to `MAP`:

```ts
  published: ["badge-ready", "Published"],
```

- [ ] **Step 3: Add PATCH to the review route** — `src/app/api/reviews/[id]/route.ts`. Keep the existing imports + GET handler; add `z`, `eq`, `requireMember`, and the PATCH:

```ts
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { requireUser, requireMember } from '@/lib/session';
```

```ts
const Patch = z.object({
  title: z.string().optional(),
  status: z.enum(['published']).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  const [review] = await db.select({ workspaceId: schema.reviews.workspaceId }).from(schema.reviews).where(eq(schema.reviews.id, id));
  if (!review) return new Response('Not found', { status: 404 });
  if (!review.workspaceId || !(await requireMember(review.workspaceId, user.id))) return new Response('Forbidden', { status: 403 });
  const body = Patch.parse(await req.json());
  const set: Record<string, unknown> = {};
  if (body.title !== undefined) set.title = body.title;
  if (body.status !== undefined) set.status = body.status;
  if (Object.keys(set).length > 0) await db.update(schema.reviews).set(set).where(eq(schema.reviews.id, id));
  return Response.json({ ok: true });
}
```
(If the existing file already imports `db`/`schema`/`requireUser`, merge — don't duplicate imports.)

- [ ] **Step 4: Verify** — `npx tsc --noEmit` + `npx eslint "src/app/api/reviews/[id]/route.ts" src/db/schema.ts src/components/ui/StatusBadge.tsx`. Also `npx vitest run` quickly to confirm the `statusValues` change didn't break any schema-shape test.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/reviews/[id]/route.ts" src/db/schema.ts src/components/ui/StatusBadge.tsx
git commit -m "feat(reviews): PATCH title/status + 'published' status and badge"
```

---

### Task 4: Composer — persist prose/title, Publish, Export

**Files:** `src/components/ReviewComposer.tsx`; `src/app/workspaces/[id]/(immersive)/reviews/[rid]/edit/page.tsx`

Client component; verified by `tsc`/`eslint`/`build` + manual.

- [ ] **Step 1: Pass review status into the composer** — in `…/reviews/[rid]/edit/page.tsx`, add `status` to the `ComposerMeta` object it builds: `status: review.status`. (The page already loads `review`.)

- [ ] **Step 2: Extend `ComposerMeta`** — in `ReviewComposer.tsx`:

```ts
export interface ComposerMeta {
  title: string;
  collectionId: string | null;
  collectionName: string | null;
  authorName: string;
  backHref: string;
  status: string;
}
```

- [ ] **Step 3: Import the exporter + add state** — near the top imports:

```ts
import { reviewToMarkdown } from '@/lib/reviews/export';
```

Add state alongside the existing `useState`s:

```ts
  const [saveState, setSaveState] = useState<'saved' | 'saving'>('saved');
  const [published, setPublished] = useState(meta.status === 'published');
  const proseTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
```

- [ ] **Step 4: Debounced prose save** — add this function (near the other mutations) and call it from the textarea:

```ts
  function scheduleProseSave(entryId: string, value: string) {
    setLocalProse((prev) => ({ ...prev, [entryId]: value }));
    setSaveState('saving');
    if (proseTimers.current[entryId]) clearTimeout(proseTimers.current[entryId]);
    proseTimers.current[entryId] = setTimeout(async () => {
      try {
        const res = await fetch(`/api/reviews/${reviewId}/entries/${entryId}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ prose: value }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setSaveState('saved');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save prose');
        setSaveState('saved');
      }
    }, 600);
  }
```

Change the prose textarea's `onInput` from the local-only `setLocalProse(...)` to:

```ts
                      onInput={(e) => {
                        const el = e.currentTarget;
                        autoGrow(el);
                        scheduleProseSave(entry.id, el.value);
                      }}
```

- [ ] **Step 5: Title save** — add:

```ts
  async function saveTitle() {
    setSaveState('saving');
    try {
      const res = await fetch(`/api/reviews/${reviewId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: localTitle }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSaveState('saved');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save title');
      setSaveState('saved');
    }
  }
```

Add `onBlur={saveTitle}` to the title `<input className="composer-title-in" …>`.

- [ ] **Step 6: Publish + Export handlers**

```ts
  async function publish() {
    setSaveState('saving');
    try {
      const res = await fetch(`/api/reviews/${reviewId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'published' }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPublished(true);
      setSaveState('saved');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to publish');
      setSaveState('saved');
    }
  }

  function exportMarkdown() {
    const merged = entries.map((e) => ({ ...e, prose: localProse[e.id] ?? e.prose }));
    const md = reviewToMarkdown(localTitle, merged, annLookup);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (localTitle.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'review') + '.md';
    a.click();
    URL.revokeObjectURL(url);
  }
```

- [ ] **Step 7: Wire the topbar** — replace the "Saved" indicator + the disabled Publish stub. The new topbar right side:

```tsx
          <span className="badge badge-ready">
            <span className="dot" /> {saveState === 'saving' ? 'Saving…' : 'Saved'}
          </span>

          <button className="btn btn-ghost btn-sm" onClick={() => setReadView((v) => !v)} aria-pressed={readView}>
            <Icon name="book" size={15} />
            {readView ? 'Edit' : 'Read view'}
          </button>

          <button className="btn btn-ghost btn-sm" onClick={exportMarkdown}>
            <Icon name="file" size={15} /> Export .md
          </button>

          {published ? (
            <span className="badge badge-ready"><span className="dot" /> Published</span>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={publish}>
              <Icon name="check" size={15} /> Publish
            </button>
          )}
```

- [ ] **Step 8: Verify** — `npx tsc --noEmit` (no new src errors) + `npx eslint src/components/ReviewComposer.tsx "src/app/workspaces/[id]/(immersive)/reviews/[rid]/edit/page.tsx"`.

- [ ] **Step 9: Manual check** — open a review, type prose (badge shows Saving→Saved; reload keeps the text), edit the title (persists on blur), Publish (badge → Published, persists on reload), Export .md downloads a file with the title + prose + quoted notes.

- [ ] **Step 10: Commit**

```bash
git add src/components/ReviewComposer.tsx "src/app/workspaces/[id]/(immersive)/reviews/[rid]/edit/page.tsx"
git commit -m "feat(reviews): persist prose/title, publish, and export markdown in the composer"
```

---

### Task 5: Printable read view

**Files:** `src/app/styles/screens.css`

- [ ] **Step 1: Add print CSS** — append:

```css
/* Print a review's read view cleanly (browser → Save as PDF). Switch to Read view first. */
@media print {
  .sidebar, .topbar, .composer-rail, .reader-topbar, .block-handle, .block-add, .composer-title-in { display: none !important; }
  .composer, .composer-main, .composer-doc { display: block; max-width: none; margin: 0; padding: 0; }
}
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit` (no change) and a quick visual check that the appended CSS is well-formed (no manual browser print needed for the commit).

- [ ] **Step 3: Commit**

```bash
git add src/app/styles/screens.css
git commit -m "feat(reviews): printable read view (@media print)"
```

---

### Task 6: Full verification + backlog

- [ ] **Step 1: Suite** — `npx vitest run` → green incl. `review-export` + the new `review-compose` case. No regressions.
- [ ] **Step 2: Typecheck** — `npx tsc --noEmit` → only the pre-existing `tests/ui/*` errors (23).
- [ ] **Step 3: Lint** — `npx eslint src/lib/reviews "src/app/api/reviews" src/components/ReviewComposer.tsx src/components/ui/StatusBadge.tsx` → 0 errors.
- [ ] **Step 4: Build** — `npx next build` → succeeds.
- [ ] **Step 5: Backlog** — mark FEAT-7 done in `docs/BACKLOG.md` (prose/title now persist; publish status + badge; markdown export; printable read view). Commit:

```bash
git add docs/BACKLOG.md
git commit -m "docs: mark FEAT-7 done (Phase 4b publish/export reviews)"
```

---

## Self-Review

**Spec coverage:**
- Persist prose (`updateProseEntry` + PATCH `{ prose }` + debounced composer save) → Tasks 2, 4 ✓
- Persist title (PATCH `{ title }` + composer onBlur) → Tasks 3, 4 ✓
- Publish (`'published'` status + PATCH + badge + button) → Tasks 3, 4 ✓
- Export markdown (`reviewToMarkdown` + client download) → Tasks 1, 4 ✓
- Printable read view (`@media print`) → Task 5 ✓
- No migration (`statusValues` is TS-only) → Task 3 ✓
- Tests: `reviewToMarkdown` unit, `updateProseEntry` integration → Tasks 1, 2 ✓

**Placeholder scan:** Task 2 Step 1 says "reuse this file's helper" for seeding a review — but also gives a concrete inline `db.insert(reviews)` so it stands alone; acceptable. All other code steps are complete.

**Type consistency:** `reviewToMarkdown(title, entries: ExportEntry[], annLookup: Record<string, ExportAnn>)` — the composer passes its `entries` (richer `Entry`, structurally compatible — extra `id` ignored) and `annLookup` (`AnnInfo` has extra `themes`, also compatible). `updateProseEntry(entryId, prose, deps)` matches the route call. `ComposerMeta.status` added in Task 4 Step 2 and supplied in Step 1. The PATCH review body `{ title?, status? }` matches the composer's `saveTitle`/`publish` calls. `'published'` added to `statusValues` (Task 3) and to `StatusBadge` MAP.
