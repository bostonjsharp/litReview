# Phase 4c — Reviews on Papers (Design)

Date: 2026-06-04
Status: approved (design approved inline; proceeding to plan)
Backlog item: FEAT-5 (continuation — "attach reviews to the papers they draw from")

## Goal

When reading a paper, see the reviews that draw from it — so it's clear which reviews
apply to which paper. Derived automatically from what each review cites; no manual linking.

This is **slice 4c** of Phase 4. 4d (matrix UX) is the last slice. **No schema change**
(the existing `review_paper_links` junction stays unused; linkage is derived).

## Decision (brainstorming)

- **Automatic / derived** linkage: a review is "on" a paper when one of its annotation
  entries cites an annotation belonging to that paper. Always in sync, zero upkeep.
- **Surfaced in the paper reader** (a small section), not on list rows.

## Current state

- A review is composed of `review_entries`; annotation entries carry `annotationId`.
- `annotations.paperId` ties a note to its paper.
- The paper reader page (`src/app/workspaces/[id]/(immersive)/papers/[pid]/page.tsx`)
  is a server component that loads the paper + annotations and renders the
  `AnnotationReader` client component. No notion of reviews today.

## Architecture

### 1. Derived query — `src/lib/reviews/service.ts`

```ts
reviewsCitingPaper(paperId: string, deps): Promise<{ id: string; title: string | null; status: string }[]>
```
Distinct reviews reached via `review_entries` (kind `'annotation'`) → `annotations`
(`paperId = <paper>`) → `reviews`. Implemented with a join + dedupe (Drizzle
`selectDistinct` or JS-side dedupe by review id). Ordered by title for stability.

### 2. Surface in the reader

- The paper page calls `reviewsCitingPaper(pid)` and passes a `citingReviews:
  { id, title }[]` prop to `AnnotationReader` (plus the workspaceId it already has).
- `AnnotationReader` renders a small **"Reviews citing this paper"** block beneath the
  byline/DOI (above the body), each item a link to `/workspaces/[id]/reviews/[rid]/edit`.
  Rendered only when the list is non-empty.

## Data flow

```
Paper page → reviewsCitingPaper(pid) → [{id,title,status}]
          → <AnnotationReader citingReviews=… />
          → "Reviews citing this paper" links → /reviews/[rid]/edit
```

## Error handling

- Empty result → the section is not rendered (no empty state needed).
- Reviews are inherently same-workspace (they cite this paper's notes), so no extra
  scoping is required beyond the paper already being workspace-scoped by the page.

## Testing strategy

- **`reviewsCitingPaper`** (`tests/integration/reviews-on-papers.test.ts`, Neon test DB):
  seed a paper + an annotation on it + a review with an annotation entry citing that
  annotation → the review is returned; a review citing a *different* paper's annotation is
  NOT returned; duplicate citations of the same paper yield one review row.
- **Reader section** — `tsc`/`eslint`/`build` + a manual check (server-component query +
  client-component render, this repo's boundary).

## Out of scope (later)

- Manual attach/detach (the `review_paper_links` table); surfacing the count on library /
  collection list rows; reviews that reference a paper without a pulled note.

## Risks / notes

- Keep the reader change additive and small (a new optional prop + a short block); don't
  disturb the annotation/highlight flows.
- `reviewsCitingPaper` joins three tables; dedupe by review id so a review citing several
  notes from the same paper appears once.
