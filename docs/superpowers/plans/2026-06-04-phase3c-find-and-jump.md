# Phase 3c — Find & Jump Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deep-link chat citations and a new standalone search to the exact passage in a paper — carry passage location through retrieval, add a `?at=<charStart>` reader anchor (scroll-to-paragraph + flash), and a top-bar → `/search` results page.

**Architecture:** Extend `ChunkSource`/`Citation` with `charStart`+`paperId`; a pure `passageHref` builds jump URLs reused by chat citations and search results; a pure `segmentOffsetForChar` + a reader effect implement `?at=`; a server-component `/search` page runs `retrieve()` directly; the inert top-bar input navigates to it.

**Tech Stack:** Next.js App Router (server + client components), TypeScript, Vitest (unit + Neon test DB), class-based CSS.

Spec: `docs/superpowers/specs/2026-06-04-phase3c-find-and-jump-design.md`
This branch stacks on `feat/phase3b-smarter-retrieval`.

## File map
- `src/lib/llm/types.ts` — `charStart`+`paperId` on `ChunkSource` & `Citation` (modify)
- `src/lib/search/retrieve.ts` — select `charStart`, set `charStart`/`paperId` (modify)
- `src/lib/llm/openai.ts` — carry the two fields into citations (modify)
- `src/lib/ui/passage-link.ts` — `passageHref` (new, pure)
- `src/lib/annotate/offsets.ts` — `segmentOffsetForChar` (modify: append)
- `src/components/AnnotationReader.tsx` — `?at=` effect (modify)
- `src/app/styles/screens.css` — `.para-flash` (modify)
- `src/components/ChatPanel.tsx` — use `passageHref`; add fields to its `Citation` (modify)
- `src/app/workspaces/[id]/(app)/search/page.tsx` — results page (new)
- `src/components/chrome/Topbar.tsx` — wire the search input (modify)
- Tests: `tests/unit/passage-link.test.ts`, `tests/unit/offsets.test.ts` (append), `tests/integration/retrieve.test.ts` (append)

---

### Task 1: Carry passage location through retrieval (TDD)

**Files:**
- Modify: `src/lib/llm/types.ts`, `src/lib/search/retrieve.ts`, `src/lib/llm/openai.ts`
- Test: `tests/integration/retrieve.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

Append these two cases inside the `describe('retrieve', …)` block in `tests/integration/retrieve.test.ts`:

```ts
  it('carries charStart and paperId on a paper-chunk source', async () => {
    const [p] = await ctx.db.insert(ctx.schema.papers).values({ title: 'Loc', status: 'ready' }).returning();
    const vec = Array(1536).fill(0); vec[2] = 1; // unique dimension → deterministically nearest
    await ctx.db.insert(ctx.schema.chunks).values({
      parentType: 'paper', parentId: p.id, chunkIndex: 0, text: 'located text',
      embedding: vec, page: 1, charStart: 42, charEnd: 54,
    });
    const res = await retrieve('q', fakeLLM(vec), ctx.db, { k: 1, schema: ctx.schema });
    expect(res[0].source.charStart).toBe(42);
    expect(res[0].source.paperId).toBe(p.id);
  });

  it('sets paperId to the containing paper for a note chunk', async () => {
    const [p] = await ctx.db.insert(ctx.schema.papers).values({ title: 'Host', status: 'ready' }).returning();
    const [a] = await ctx.db.insert(ctx.schema.annotations).values({ paperId: p.id, charStart: 0, charEnd: 4, quote: 'x', comment: 'y' }).returning();
    const vec = Array(1536).fill(0); vec[3] = 1; // unique dimension
    await ctx.db.insert(ctx.schema.chunks).values({
      parentType: 'annotation', parentId: a.id, chunkIndex: 0, text: 'note text',
      embedding: vec, page: 1, charStart: 0, charEnd: 9,
    });
    const res = await retrieve('q', fakeLLM(vec), ctx.db, { k: 1, schema: ctx.schema });
    expect(res[0].source.parentType).toBe('annotation');
    expect(res[0].source.paperId).toBe(p.id);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/integration/retrieve.test.ts`
Expected: FAIL — `source.charStart`/`source.paperId` are `undefined` today.

- [ ] **Step 3: Extend the types**

In `src/lib/llm/types.ts`, add two fields to BOTH `ChunkSource` and `Citation`:

```ts
export interface ChunkSource {
  parentType: ParentType;
  parentId: string;
  title: string;
  page: number | null;
  charStart: number;
  paperId: string | null;
}

export interface RetrievedChunk {
  id: string;
  text: string;
  source: ChunkSource;
}

export interface Citation {
  parentType: ParentType;
  parentId: string;
  title: string;
  page: number | null;
  charStart: number;
  paperId: string | null;
}
```

- [ ] **Step 4: Populate them in `retrieve.ts`**

In `src/lib/search/retrieve.ts`, add `charStart` to the `select`:

```ts
    .select({
      id: schema.chunks.id,
      text: schema.chunks.text,
      parentType: schema.chunks.parentType,
      parentId: schema.chunks.parentId,
      page: schema.chunks.page,
      charStart: schema.chunks.charStart,
    })
```

Then replace the result-building loop with:

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
        source: {
          parentType: 'annotation',
          parentId: r.parentId,
          title: `Note on ${paper?.title ?? 'Untitled'}`,
          page: r.page,
          charStart: r.charStart,
          paperId: ann?.paperId ?? null,
        },
      });
      continue;
    }
    const table = r.parentType === 'paper' ? schema.papers : schema.reviews;
    const [parent] = await db.select({ title: table.title }).from(table).where(eq(table.id, r.parentId));
    out.push({
      id: r.id,
      text: r.text,
      source: {
        parentType: r.parentType,
        parentId: r.parentId,
        title: parent?.title ?? 'Untitled',
        page: r.page,
        charStart: r.charStart,
        paperId: r.parentType === 'paper' ? r.parentId : null,
      },
    });
  }
  return out;
```

- [ ] **Step 5: Carry them in `openai.ts`**

In `src/lib/llm/openai.ts`, extend the citation `.map`:

```ts
      .map((c) => ({
        parentType: c.source.parentType,
        parentId: c.source.parentId,
        title: c.source.title,
        page: c.source.page,
        charStart: c.source.charStart,
        paperId: c.source.paperId,
      }));
```

- [ ] **Step 6: Run tests + typecheck**

Run: `npx vitest run tests/integration/retrieve.test.ts` → PASS.
Run: `npx tsc --noEmit` → no new `src/` errors (the required fields are now set everywhere `ChunkSource`/`Citation` are built).

- [ ] **Step 7: Commit**

```bash
git add src/lib/llm/types.ts src/lib/search/retrieve.ts src/lib/llm/openai.ts tests/integration/retrieve.test.ts
git commit -m "feat(search): carry passage location (charStart, paperId) through retrieval"
```

---

### Task 2: `passageHref` helper (TDD)

**Files:**
- Create: `src/lib/ui/passage-link.ts`
- Test: `tests/unit/passage-link.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/passage-link.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { passageHref } from '@/lib/ui/passage-link';

describe('passageHref', () => {
  it('links a paper passage with ?at=', () => {
    expect(passageHref('w', { parentType: 'paper', parentId: 'p1', paperId: 'p1', charStart: 42 }))
      .toBe('/workspaces/w/papers/p1?at=42');
  });
  it('links a note to its paper with ?ann=', () => {
    expect(passageHref('w', { parentType: 'annotation', parentId: 'a1', paperId: 'p2', charStart: 0 }))
      .toBe('/workspaces/w/papers/p2?ann=a1');
  });
  it('returns undefined for a note with no paper', () => {
    expect(passageHref('w', { parentType: 'annotation', parentId: 'a1', paperId: null, charStart: 0 }))
      .toBeUndefined();
  });
  it('links a review to its edit page', () => {
    expect(passageHref('w', { parentType: 'review', parentId: 'r1', paperId: null, charStart: 0 }))
      .toBe('/workspaces/w/reviews/r1/edit');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/passage-link.test.ts`
Expected: FAIL — "Cannot find module '@/lib/ui/passage-link'".

- [ ] **Step 3: Implement**

Create `src/lib/ui/passage-link.ts`:

```ts
import type { ParentType } from '@/lib/llm/types';

// Builds the deep-link URL for a retrieved passage / citation. Single source of truth
// for chat citations and search results. Returns undefined when there is no sensible
// in-app target (e.g. a note whose paper is unknown).
export function passageHref(
  workspaceId: string,
  c: { parentType: ParentType; parentId: string; paperId: string | null; charStart: number },
): string | undefined {
  const base = `/workspaces/${workspaceId}`;
  if (c.parentType === 'paper') return `${base}/papers/${c.parentId}?at=${c.charStart}`;
  if (c.parentType === 'annotation') return c.paperId ? `${base}/papers/${c.paperId}?ann=${c.parentId}` : undefined;
  if (c.parentType === 'review') return `${base}/reviews/${c.parentId}/edit`;
  return undefined;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/passage-link.test.ts` → PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ui/passage-link.ts tests/unit/passage-link.test.ts
git commit -m "feat(search): add passageHref deep-link helper"
```

---

### Task 3: `segmentOffsetForChar` helper (TDD)

**Files:**
- Modify: `src/lib/annotate/offsets.ts` (append)
- Test: `tests/unit/offsets.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/offsets.test.ts` (add the import for `segmentOffsetForChar` to the existing import from `@/lib/annotate/offsets` if there is one, or add a new import line):

```ts
import { segmentOffsetForChar } from '@/lib/annotate/offsets';

describe('segmentOffsetForChar', () => {
  // "aaaa\nbbbb\ncccc" → segments at offsets 0, 5, 10
  const segs = [
    { offset: 0, text: 'aaaa' },
    { offset: 5, text: 'bbbb' },
    { offset: 10, text: 'cccc' },
  ];
  it('finds the segment containing the offset', () => {
    expect(segmentOffsetForChar(segs, 2)).toBe(0);
    expect(segmentOffsetForChar(segs, 6)).toBe(5);
    expect(segmentOffsetForChar(segs, 12)).toBe(10);
  });
  it('clamps before the first and after the last segment', () => {
    expect(segmentOffsetForChar(segs, 0)).toBe(0);
    expect(segmentOffsetForChar(segs, 999)).toBe(10);
  });
  it('returns null for no segments', () => {
    expect(segmentOffsetForChar([], 5)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/offsets.test.ts`
Expected: FAIL — `segmentOffsetForChar` is not exported.

- [ ] **Step 3: Implement**

Append to `src/lib/annotate/offsets.ts`:

```ts
// Returns the `offset` of the rendered segment (paragraph) that contains `charOffset` —
// i.e. the last segment whose start is at or before it. Clamps before the first segment
// and after the last; returns null when there are no segments. Used to scroll a `?at=`
// deep-link to the right paragraph.
export function segmentOffsetForChar(segments: TextSegment[], charOffset: number): number | null {
  if (segments.length === 0) return null;
  let result = segments[0].offset;
  for (const seg of segments) {
    if (seg.offset <= charOffset) result = seg.offset;
    else break;
  }
  return result;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/offsets.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/annotate/offsets.ts tests/unit/offsets.test.ts
git commit -m "feat(reader): add segmentOffsetForChar helper for ?at= anchoring"
```

---

### Task 4: Reader `?at=` anchor (scroll-to-paragraph + flash)

**Files:**
- Modify: `src/components/AnnotationReader.tsx`
- Modify: `src/app/styles/screens.css`

Client-component behavior; verified by `tsc`/`eslint`/`build` + manual.

- [ ] **Step 1: Add the `.para-flash` CSS**

Append to `src/app/styles/screens.css`:

```css
/* ?at= deep-link: briefly highlight the paragraph a passage lives in */
@keyframes para-flash {
  0%, 100% { background: transparent; }
  25% { background: var(--accent-soft); }
}
.para-flash { animation: para-flash 1.2s ease-out; border-radius: 4px; }
```

- [ ] **Step 2: Import the helper**

In `src/components/AnnotationReader.tsx`, extend the existing import from `@/lib/annotate/offsets`:

```tsx
import { splitIntoSegments, resolveSelection, segmentOffsetForChar } from '@/lib/annotate/offsets';
```

- [ ] **Step 3: Add a one-shot ref and the `?at=` effect**

Add a ref next to the other refs (near `deepLinkedRef`):

```tsx
  const atFlashedRef = useRef(false);
```

Add this effect right after the existing `?ann=` deep-link effect:

```tsx
  // Deep-link: ?at=<charStart> scrolls to the paragraph that contains the passage and
  // flashes it. `?ann=` (a specific highlight) takes precedence when both are present.
  useEffect(() => {
    if (atFlashedRef.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('ann')) return;
    const at = params.get('at');
    if (at == null) return;
    const n = Number(at);
    if (!Number.isFinite(n)) return;
    const segOffset = segmentOffsetForChar(segments, n);
    if (segOffset == null) return;
    const el = document.querySelector(`[data-base="${segOffset}"]`);
    if (!el) return;
    atFlashedRef.current = true;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('para-flash');
    const t = setTimeout(() => el.classList.remove('para-flash'), 1200);
    return () => clearTimeout(t);
  }, [segments]);
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` (no new `src/` errors) and `npx eslint src/components/AnnotationReader.tsx` (0 errors).

- [ ] **Step 5: Manual check**

Visit `…/papers/<pid>?at=<n>` for a char offset within the paper — the page scrolls to that paragraph and flashes it. `?ann=<id>` still wins when both are present.

- [ ] **Step 6: Commit**

```bash
git add src/components/AnnotationReader.tsx src/app/styles/screens.css
git commit -m "feat(reader): ?at=<charStart> deep-link scrolls to and flashes the paragraph"
```

---

### Task 5: Chat citation deep-links

**Files:**
- Modify: `src/components/ChatPanel.tsx`

- [ ] **Step 1: Add fields to ChatPanel's Citation + import the helper**

In `src/components/ChatPanel.tsx`, extend the local `Citation` interface and import `passageHref`:

```tsx
import { passageHref } from '@/lib/ui/passage-link';
```

```tsx
interface Citation {
  parentType: 'paper' | 'review' | 'annotation';
  parentId: string;
  title: string;
  page: number | null;
  charStart: number;
  paperId: string | null;
}
```

- [ ] **Step 2: Use `passageHref` in `AnswerText` (the inline [n] markers)**

In `AnswerText`, replace the href computation:

```tsx
        const n = parseInt(part, 10);
        const cite = citations[n - 1];
        if (!cite) return <sup key={i}>[{part}]</sup>;
        const href = passageHref(workspaceId, cite);
```

(The rest — rendering `<Link><sup>{n}</sup></Link>` when `href` exists, else `<sup>{n}</sup>` — stays the same.)

- [ ] **Step 3: Use `passageHref` in the `.cites` source list**

In the citations block, replace the per-source href:

```tsx
                        {m.citations.map((c, j) => {
                          const href = passageHref(workspaceId, c);
```

(Leave the rest of that block unchanged.)

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` (no new `src/` errors) and `npx eslint src/components/ChatPanel.tsx` (0 errors).

- [ ] **Step 5: Manual check**

Ask a question, then click a citation `[1]` and a source row — the reader opens at the cited paragraph (paper) or highlight (note) and flashes.

- [ ] **Step 6: Commit**

```bash
git add src/components/ChatPanel.tsx
git commit -m "feat(chat): citations deep-link to the exact passage (BUG-9 chat side)"
```

---

### Task 6: Standalone search page + top-bar wiring (FEAT-1)

**Files:**
- Create: `src/app/workspaces/[id]/(app)/search/page.tsx`
- Modify: `src/components/chrome/Topbar.tsx`

- [ ] **Step 1: Create the search results page (server component)**

Create `src/app/workspaces/[id]/(app)/search/page.tsx`:

```tsx
import Link from 'next/link';
import { db, schema } from '@/db/client';
import { getLLM } from '@/lib/llm';
import { retrieve } from '@/lib/search/retrieve';
import { passageHref } from '@/lib/ui/passage-link';
import { Icon } from '@/components/ui/Icon';

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { id } = await params;
  const { q } = await searchParams;
  const query = (q ?? '').trim();
  const results = query
    ? await retrieve(query, getLLM(), db, { scope: { workspaceId: id }, schema })
    : [];

  return (
    <>
      <div className="list-head">
        <h2>
          Search{query ? <> · <span className="count">{results.length}</span></> : null}
        </h2>
      </div>

      {!query && (
        <p className="meta">Type in the search bar above to find passages across this workspace.</p>
      )}
      {query && results.length === 0 && (
        <p className="meta">No matching passages for &ldquo;{query}&rdquo;.</p>
      )}

      {results.length > 0 && (
        <div className="card list-card">
          {results.map((r) => {
            const href = passageHref(id, {
              parentType: r.source.parentType,
              parentId: r.source.parentId,
              paperId: r.source.paperId,
              charStart: r.source.charStart,
            });
            const snippet = r.text.length > 240 ? r.text.slice(0, 240) + '…' : r.text;
            const inner = (
              <>
                <div className="paper-main">
                  <div className="paper-title" style={{ fontWeight: 400 }}>{snippet}</div>
                  <div className="paper-meta">
                    <span className="meta">
                      {r.source.title}
                      {r.source.page != null ? ` · p.${r.source.page}` : ''}
                    </span>
                  </div>
                </div>
                {href && <Icon name="arrowRight" size={15} style={{ color: 'var(--faint)' }} />}
              </>
            );
            return href ? (
              <Link key={r.id} href={href} className="paper-row click">{inner}</Link>
            ) : (
              <div key={r.id} className="paper-row">{inner}</div>
            );
          })}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Wire the top-bar search input**

Replace `src/components/chrome/Topbar.tsx` with (adds `useRouter` + input state + Enter-to-search):

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { Avatar } from "@/components/ui/Avatar";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { WorkspaceMenu } from "./WorkspaceMenu";
import { initials } from "@/lib/ui/display";

export function Topbar({ workspace, workspaces, userName }: {
  workspace: { id: string; name: string; role: string; memberCount: number };
  workspaces: { id: string; name: string }[];
  userName: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const router = useRouter();

  function runSearch() {
    const query = q.trim();
    if (query) router.push(`/workspaces/${workspace.id}/search?q=${encodeURIComponent(query)}`);
  }

  return (
    <header className="topbar themed">
      <div className="ws-switch-wrap">
        <button className="ws-switch" onClick={() => setOpen(!open)}>
          <span className="ws-mark">{initials(workspace.name)}</span>
          <span className="ws-text">
            <span className="ws-name">{workspace.name}</span>
            <span className="ws-role">{workspace.role === "owner" ? "Owner" : "Member"} · {workspace.memberCount} members</span>
          </span>
          <Icon name="chevronDown" size={16} style={{ color: "var(--muted)" }} />
        </button>
        {open && <WorkspaceMenu activeId={workspace.id} workspaces={workspaces} close={() => setOpen(false)} />}
      </div>
      <div className="topbar-search">
        <Icon name="search" size={17} style={{ color: "var(--faint)" }} />
        <input
          placeholder="Search papers, notes, themes…"
          aria-label="Search papers, notes and themes"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); runSearch(); } }}
        />
        <span className="kbd">⏎</span>
      </div>
      <div className="row gap2">
        <ThemeToggle />
        <Link className="topbar-me" href="/" title="Your account"><Avatar name={userName} size={32} /></Link>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` (no new `src/` errors) and `npx eslint "src/app/workspaces/[id]/(app)/search/page.tsx" src/components/chrome/Topbar.tsx` (0 errors).

- [ ] **Step 4: Manual check**

Type a term in the top bar, press Enter → lands on `/workspaces/<id>/search?q=…` showing ranked passages; clicking one jumps into the paper at the passage (scroll + flash).

- [ ] **Step 5: Commit**

```bash
git add "src/app/workspaces/[id]/(app)/search/page.tsx" src/components/chrome/Topbar.tsx
git commit -m "feat(search): top-bar search → server-rendered results page with jump links (FEAT-1)"
```

---

### Task 7: Full verification + backlog

**Files:**
- Modify: `docs/BACKLOG.md`

- [ ] **Step 1: Full suite**

Run: `npx vitest run`
Expected: all green, including the new `passage-link` and `segmentOffsetForChar` cases and the `retrieve` location cases.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: only the pre-existing `tests/ui/*` errors (23 baseline); zero new in `src/`.

- [ ] **Step 3: Lint changed files**

Run: `npx eslint src/lib/ui/passage-link.ts src/lib/search/retrieve.ts src/lib/annotate/offsets.ts src/components/AnnotationReader.tsx src/components/ChatPanel.tsx src/components/chrome/Topbar.tsx "src/app/workspaces/[id]/(app)/search/page.tsx"`
Expected: 0 errors.

- [ ] **Step 4: Build**

Run: `npx next build`
Expected: succeeds; route list includes `/workspaces/[id]/search`.

- [ ] **Step 5: Update the backlog**

In `docs/BACKLOG.md`, mark FEAT-1 done and complete BUG-9 (the chat-side / `?at=` half). Commit:

```bash
git add docs/BACKLOG.md
git commit -m "docs: mark FEAT-1 + BUG-9 (chat side) done (Phase 3c)"
```

---

## Self-Review

**Spec coverage:**
- Location through `ChunkSource`/`Citation` (charStart + paperId), retrieve.ts, openai.ts → Task 1 ✓
- `passageHref` (paper `?at=`, note `?ann=`, note-no-paper undefined, review edit) → Task 2 ✓
- `segmentOffsetForChar` (contains / clamp / empty) → Task 3 ✓
- `?at=` reader effect (scroll-to-paragraph + flash, `?ann=` precedence) + `.para-flash` → Task 4 ✓
- Chat citation deep-links via `passageHref` (inline + sources) → Task 5 ✓
- Search server page + top-bar wiring, literal query → Task 6 ✓
- Tests: passageHref unit, segment unit, retrieve location integration → Tasks 1–3 ✓

**Placeholder scan:** No TBD/TODO; complete code in every code step; client/server-UI tasks state the exact manual check.

**Type consistency:** `charStart: number` + `paperId: string | null` added identically to `ChunkSource`, `Citation` (lib), and `ChatPanel`'s local `Citation`. `passageHref(workspaceId, { parentType, parentId, paperId, charStart })` signature matches both call sites (Task 5 chat, Task 6 search). `segmentOffsetForChar(segments: TextSegment[], charOffset: number): number | null` matches its consumer in Task 4. `retrieve` now selects `charStart` and every `source` literal sets both new fields, so `tsc` (Task 1 Step 6) catches any miss.

**Note:** Tasks 1–3 are real TDD units; Tasks 4–6 are client/server-component changes verified by build + manual (this repo's boundary), and they depend only on the typed, tested helpers from 1–3.
