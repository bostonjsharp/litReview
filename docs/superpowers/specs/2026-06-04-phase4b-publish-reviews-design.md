# Phase 4b — Publish & Export Reviews (Design)

Date: 2026-06-04
Status: approved (design approved inline; proceeding to plan)
Backlog item: FEAT-7

## Goal

Make reviews real and shippable: persist what you write (prose blocks + title), let you
**publish** a review (finalize within the workspace), **export** it to markdown, and
**print** the read view to PDF. Completes the "create new literature reviews" half of the
vision.

This is **slice 4b** of Phase 4. 4c (attach reviews to papers) and 4d (matrix UX) follow.
**No DB migration** — `'published'` is added to the TS-only `statusValues` enum (the
`status` column is plain `text`).

## Decisions made during brainstorming

- **Export = markdown + printable read view** (no heavy server-side PDF dependency).
- **Publish = finalize within the workspace** (a `status: 'published'` flag + badge; the
  review stays behind workspace membership — no public/anonymous links).
- **Markdown is built client-side** in the composer from current state (no export route).
- The composer must first **persist prose edits and the title** — today they're local-only
  (stubs), so there is nothing real to publish.

## Current state (what we're changing)

- `src/components/ReviewComposer.tsx`: prose text edits are **local-only** (`localProse`
  state; comment: "no PATCH-prose endpoint"); the **title** is local-only (no rename API);
  the **Publish** button is a disabled no-op. New prose blocks are created via
  `POST …/entries` with a blank `' '` placeholder. A **Read view** toggle already exists
  (`ReadView`).
- `src/lib/reviews/service.ts`: `addProseEntry`, `addAnnotationEntry`, `moveEntry`,
  `removeEntry`, `getReviewEntries` — **no prose update**.
- `src/app/api/reviews/[id]/entries/[entryId]/route.ts`: PATCH handles `{ direction }`
  (move); DELETE removes. `src/app/api/reviews/[id]/route.ts`: GET returns status (Phase 1)
  — **no PATCH**.
- `src/db/schema.ts`: `statusValues = ['pending','processing','ready','failed','metadata_only']`
  used by `reviews.status` as a `text(..., { enum })` (TS-only; no DB constraint).

## Architecture

### 1. Persist prose edits

- **Service** `src/lib/reviews/service.ts` — add:
  ```ts
  updateProseEntry(entryId: string, prose: string, deps): Promise<void>
  ```
  Updates the `prose` column of a `'prose'` entry.
- **Route** `…/entries/[entryId]/route.ts` — extend PATCH to a discriminated body: `{ prose }`
  → `updateProseEntry`; `{ direction }` → existing `moveEntry` (unchanged). Member-guarded
  as today.
- **Composer** — replace the local-only prose handling: on textarea input, debounce
  (~600ms) a `PATCH …/entries/[entryId] { prose }`. New prose blocks still start empty.
  Keep the auto-grow. The "Saved" indicator reflects in-flight saves ("Saving…/Saved").

### 2. Persist title + publish

- **Route** `src/app/api/reviews/[id]/route.ts` — add `PATCH` accepting
  `{ title?: string, status?: 'published' }` (zod). Member-guarded (resolve the review's
  workspace, `requireMember`). Updates the provided fields.
- **Schema** `src/db/schema.ts` — add `'published'` to `statusValues` (no migration).
- **Composer** — save the title via `PATCH …/[id] { title }` on blur/debounce; wire the
  **Publish** button to `PATCH …/[id] { status: 'published' }`, then show a **Published**
  badge (replace the stub). A published review can still be edited (publish is a marker,
  not a lock).

### 3. Export to markdown

- **Pure** `src/lib/reviews/export.ts`:
  ```ts
  reviewToMarkdown(title: string, entries: Entry[], annLookup: Record<string, AnnInfo>): string
  ```
  Renders, in `position` order: `# <title>`, prose entries as paragraphs, annotation
  entries as `> "<quote>" — <sourceLabel>[ · p.N]`. Skips empty prose and unknown
  annotations. Deterministic; unit-tested.
- **Composer** — an **"Export .md"** button builds the string from current `entries` +
  `annLookup` and triggers a client-side download (`Blob` + object URL) named from the
  title (slugified, fallback `review.md`).

### 4. Printable read view

- `src/app/styles/screens.css` — `@media print` rules: when the composer is in **Read
  view**, hide the rail, topbar, block handles, and editor chrome; show only
  `.composer-doc`. The user prints to PDF via the browser. (Keep it minimal — target the
  existing read-view markup.)

## Data flow

```
Type prose → debounce → PATCH …/entries/<id> { prose } → persisted
Edit title  → blur → PATCH …/reviews/<id> { title } → persisted
Publish     → PATCH …/reviews/<id> { status:'published' } → badge
Export .md  → reviewToMarkdown(...) → Blob download (client)
Read view + browser print → PDF
```

## Error handling

- Debounced prose/title saves: on failure, surface the existing error banner and mark
  unsaved (the user can retry by editing again); never lose the in-textarea text.
- PATCH routes: 401 unauth, 403 non-member, 404 unknown review/entry, 400 bad body.
- Export builds from client state — always available, even offline.

## Testing strategy

- **`reviewToMarkdown`** (`tests/unit/review-export.test.ts`): title heading; prose
  paragraphs in order; annotation as blockquote with source + page; empty prose and
  missing-annotation entries skipped.
- **`updateProseEntry`** (extend `tests/integration/review-compose.test.ts` or a new file,
  Neon test DB): updating an entry's prose persists and is returned by `getReviewEntries`.
- **PATCH review (title/status), composer debounce-save, export button, publish badge,
  print CSS** — `tsc`/`eslint`/`build` + manual click-through (route handlers + client
  component, this repo's boundary).

## Out of scope (later)

- Public/anonymous share links; server-side PDF generation; collaborative/real-time
  editing; drag-and-drop block reordering (still up/down buttons); review version history;
  un-publish workflow beyond editing.
- Attaching reviews to their source papers → slice 4c.

## Risks / notes

- The composer is a large client component; keep changes focused on prose-save, title-save,
  publish, and export — don't disturb the entry add/move/delete flows.
- Debounce must flush on unmount / before navigation isn't required for this slice (the
  user sees Saving/Saved); a pending edit lost on instant navigation is acceptable and
  noted. Keep the debounce short (~600ms).
- `'published'` is purely additive to `statusValues`; confirm no exhaustive `switch` on
  status elsewhere breaks (StatusBadge handles unknown gracefully — verify it renders
  'published').
