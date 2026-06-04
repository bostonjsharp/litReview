# Phase 3c — Find & Jump: Search Bar + Precise Citation Deep-Links (Design)

Date: 2026-06-04
Status: approved (design approved inline; proceeding to plan)
Backlog items: FEAT-1, BUG-9 (chat side)

## Goal

Let users jump straight to the exact passage behind an answer or a search hit: chat
citations and a new standalone search bar both deep-link into the paper at the right
spot (scroll + flash). Builds on Phase 2's `?ann=` anchor by adding a `?at=<charStart>`
anchor for ordinary passages.

This is **slice 3c** of Phase 3 (final slice). It **stacks on the 3b branch**
(`feat/phase3b-smarter-retrieval`) because it modifies `retrieve.ts`, the `Citation`
type, and `openai.ts`, which 3b also touched — keeping them composed avoids divergence.

## Decisions made during brainstorming

- **Search lives in the top-bar → results page.** The existing inert top-bar input
  navigates (on Enter) to `/workspaces/[id]/search?q=…`, a **server-component** page that
  runs `retrieve()` directly (no new API route, no client fetch) and lists ranked
  passages with jump links.
- **`?at=` scrolls to the containing paragraph and flashes it** (not exact-character-span
  highlighting) — simpler, robust, reuses the flash.
- **Search is literal** — no 3b-style query rewrite (the user typed exactly what they
  want; rewrite is for conversational follow-ups only).

## Current state (what we're changing)

- `src/lib/search/retrieve.ts` — `select`s `id, text, parentType, parentId, page` only
  (NOT `charStart`); builds `source = { parentType, parentId, title, page }`. For
  annotation chunks it already looks up the parent paper (for the `"Note on …"` title) but
  discards the paper's id.
- `src/lib/llm/types.ts` — `ChunkSource` and `Citation` are `{ parentType, parentId,
  title, page }`. No location.
- `src/lib/llm/openai.ts` — `chat()` builds citations from `c.source` (the four fields).
- `src/components/ChatPanel.tsx` — citation links go to `/papers/[parentId]` (no anchor),
  and only for `parentType === 'paper'`.
- `src/components/AnnotationReader.tsx` — has a `?ann=<id>` effect (scroll to `#hl-<id>` +
  flash). No `?at=` handling. Paragraphs render as `<p data-base={seg.offset}>`.
- `src/lib/annotate/offsets.ts` — `splitIntoSegments(text) → { offset, text }[]`.
- `src/components/chrome/Topbar.tsx` — inert `<input … aria-label="Search (coming soon)">`.

## Architecture

### 1. Carry passage location — `RetrievedChunk` → `Citation`

`src/lib/llm/types.ts`: extend both source/citation shapes:
```ts
export interface ChunkSource {
  parentType: ParentType;
  parentId: string;
  title: string;
  page: number | null;
  charStart: number;          // NEW — offset of the passage in the paper/review full text
  paperId: string | null;     // NEW — the containing paper (for notes); null for reviews
}
export interface Citation {    // same four new+old fields
  parentType: ParentType;
  parentId: string;
  title: string;
  page: number | null;
  charStart: number;          // NEW
  paperId: string | null;     // NEW
}
```

`src/lib/search/retrieve.ts`:
- Add `charStart: schema.chunks.charStart` to the `select`.
- For **paper** chunks: `paperId = parentId`, `charStart = r.charStart`.
- For **review** chunks: `paperId = null` (no full-text reader), `charStart = r.charStart`.
- For **annotation** chunks: keep the existing parent-paper lookup but also capture its
  `id` → `paperId = <that paper id>`, `charStart = r.charStart` (the annotation's chunk
  offset; the deep-link uses `?ann=` not `?at=`, so charStart is informational here).

`src/lib/llm/openai.ts`: include `charStart` and `paperId` when mapping
`context[n-1].source` → citation.

### 2. Deep-link href helper — `src/lib/ui/passage-link.ts` (new, pure)

One place that builds a jump URL from a source/citation, reused by chat citations AND
search results:
```ts
passageHref(workspaceId: string, c: { parentType: ParentType; parentId: string; paperId: string | null; charStart: number }): string | undefined
```
- `paper`  → `/workspaces/${ws}/papers/${parentId}?at=${charStart}`
- `annotation` → `paperId ? /workspaces/${ws}/papers/${paperId}?ann=${parentId} : undefined`
- `review` → `/workspaces/${ws}/reviews/${parentId}/edit`
Returns `undefined` when no sensible target exists (rendered as plain, non-linked text).

### 3. `?at=<charStart>` reader anchor

`src/lib/annotate/offsets.ts` — add a pure helper:
```ts
segmentOffsetForChar(segments: { offset: number; text: string }[], charOffset: number): number | null
```
Returns the `offset` of the segment whose `[offset, offset+text.length)` range contains
`charOffset` (clamps: before-first → first segment's offset; after-last → last segment's
offset; empty list → null).

`src/components/AnnotationReader.tsx` — add a `?at=` effect alongside the existing `?ann=`
one. On mount, read `?at=N` from `window.location.search`; if present, compute
`segmentOffsetForChar(segments, N)`, find the paragraph `[data-base="<segOffset>"]`,
`scrollIntoView({ block: 'center' })`, and add a transient `.para-flash` class (~1.2s).
`?ann=` takes precedence if both are present (annotation is more specific).

`src/app/styles/screens.css` — a `.para-flash` keyframe (a soft background pulse on the
`<p>`, distinct from the `.hl-flash` ring used on marks).

### 4. Chat citation deep-links (BUG-9 chat side)

`src/components/ChatPanel.tsx` — replace the inline `parentType === 'paper'` href logic
in BOTH the inline `[n]` markers (`AnswerText`) and the `.cites` source list with
`passageHref(workspaceId, c)`. Citations now carry `charStart`/`paperId` (from §1). The
`Citation` interface in `ChatPanel` gains the two fields to match the API response.

### 5. Standalone search (FEAT-1)

- **Page** `src/app/workspaces/[id]/(app)/search/page.tsx` (server component): reads
  `searchParams.q`; if empty, shows a prompt; else runs
  `retrieve(q, getLLM(), db, { scope: { workspaceId: id }, schema })` and renders the
  ranked passages — each row: snippet (`chunk.text`, truncated), source title + page, and
  a jump link via `passageHref(id, source)`. Membership is already enforced by the
  `(app)` layout.
- **Top-bar wiring** `src/components/chrome/Topbar.tsx`: give the input local state + a
  router; on **Enter** with a non-empty value, `router.push(/workspaces/${id}/search?q=…)`.
  Update the placeholder/aria-label (drop "coming soon"). The Topbar already receives the
  workspace id.

## Data flow

```
Chat answer → citation { parentType, parentId, paperId, charStart }
            → passageHref → /papers/[id]?at=N  (or ?ann= for notes)
            → reader scrolls to the paragraph + flashes

Top-bar "attention" ⏎ → /workspaces/[id]/search?q=attention (server)
            → retrieve(q, scope=workspace) → ranked passages
            → each row: passageHref → same jump behavior
```

## Error handling

- `?at=N` for an offset past the text / empty text → clamp to the nearest segment (helper
  never throws); if no paragraph element is found, no-op (no scroll, no error).
- Citations/sources without a valid target (`passageHref` → undefined) render as plain
  text, not a broken link.
- Empty search query → the page shows a "type to search" prompt (no retrieval call).
- Review citations keep linking to the review edit page (no `?at=`).

## Testing strategy

- **`passageHref`** — unit test (`tests/unit/passage-link.test.ts`): paper → `?at=`,
  note with paperId → `?ann=`, note without paperId → undefined, review → edit URL.
- **`segmentOffsetForChar`** — unit test (add to `tests/unit/offsets.test.ts`): offset in
  first/middle/last segment; before-first and after-last clamp; empty → null.
- **`retrieve` carries location** — extend `tests/integration/retrieve.test.ts`: assert
  `source.charStart` is set, and for a seeded annotation chunk `source.paperId` is the
  containing paper.
- **Reader `?at=` effect, search page, top-bar nav** — client/server-component behavior,
  verified by `tsc` + `eslint` + `next build` + a manual click-through (the existing repo
  boundary).

## Out of scope (later)

- Exact character-span highlighting for `?at=` (paragraph flash is enough).
- Search filters/scoping UI, pagination, snippet highlighting of the matched terms.
- `⌘K` palette / live dropdown results (we chose the results-page approach).
- Deep-linking into reviews at an offset (reviews are block-based).

## Risks / notes

- `ChunkSource`/`Citation` gain required `charStart`/`paperId` — every constructor of
  those shapes (retrieve.ts, openai.ts, and the `Citation` interfaces duplicated in
  `ChatPanel.tsx`) must set them; `tsc` will catch any miss.
- Reviews and notes don't use `?at=`; only paper chunks do. Keep the type-based branching
  in `passageHref` the single source of truth.
- `.para-flash` must target the `<p>` without disturbing the reader's selection/offset
  math (purely visual, like `.hl-flash`).
