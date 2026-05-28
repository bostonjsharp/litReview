# LitReview — Phase 2 Design: In-App Reading & Annotation

**Date:** 2026-05-28
**Status:** Approved (design)
**Builds on:** Phase 1 (foundation, import, citation-grounded chat). See `2026-05-28-litreview-phase1-design.md`.
**Scope:** Phase 2 of 3. Phase 3 (synthesis/export) remains a separate cycle.

## Context & Goals

Phase 1 lets the team import papers and reviews and chat over them. Phase 2 adds the **author-in-app** workflow: read a paper's text in the app, highlight passages, attach comments, and **assemble a review from those annotations** plus connecting prose. Annotations also feed the existing chat so the team's own synthesis becomes searchable.

Key decisions made during brainstorming:
- **Clean text view, not PDF rendering.** Annotation happens over the paper's extracted `full_text` (already stored in Phase 1, with page offsets). Highlights are character ranges. This reuses Phase 1's data and avoids the fragility of overlaying highlights on rendered PDF.
- **Annotations are paper-level and reusable.** An annotation belongs to a paper, not a review, so the same annotation can appear in multiple reviews.
- **A review assembles from annotations.** An in-app-authored review is an ordered list of blocks: prose blocks the author writes, and annotation blocks that reference paper-level annotations. Imported reviews keep using their Phase 1 `bodyText`.
- **Annotations are searchable in chat.** An annotation's `quote + comment` is embedded as a chunk so retrieval/chat can surface and cite it.
- **Lightweight implementation.** A custom selectable-text reader and a block-list review composer — no heavy rich-text-editor dependency (ProseMirror/TipTap).

## Non-Goals (Phase 2)

- Rendering the original PDF (figures/layout). Text view only.
- Export to BibTeX/Word/Markdown (Phase 3).
- Theme/tag-based synthesis and the literature matrix (Phase 3).
- Automatic citation→paper linking (Phase 3).
- Real-time multi-user co-editing of the same annotation/review (single-writer assumed; last write wins).

## Architecture

No new infrastructure. Phase 2 adds:
- Two tables (`annotations`, `review_entries`) and one enum extension (`chunks.parentType` gains `'annotation'`), via a new Drizzle migration.
- API routes for annotation CRUD, review-entry composition/reorder, and reading a paper.
- An `embedAnnotation` helper that keeps an annotation's chunk in sync (create/update/delete).
- A one-case extension to `retrieve` so annotation chunks resolve a sensible citation.
- Three UI surfaces: the reader, the annotations sidebar, and the review composer.

## Data Model Additions

### `annotations`
- `id` (uuid, pk)
- `paperId` (uuid, FK → papers, on delete cascade)
- `createdBy` (uuid, FK → users)
- `charStart` (int), `charEnd` (int) — range within the paper's `full_text`
- `page` (int, nullable) — derived via Phase 1's `pageForOffset`
- `quote` (text) — the highlighted substring (denormalized for display/embedding)
- `comment` (text) — the author's note
- `createdAt`, `updatedAt` (timestamps)

Constraint: `charEnd > charStart`, both within `[0, length(full_text)]`. Empty `comment` is allowed (a highlight with no note), but an annotation chunk is only embedded when `comment` or `quote` is non-empty.

### `review_entries`
- `id` (uuid, pk)
- `reviewId` (uuid, FK → reviews, on delete cascade)
- `position` (int) — ordering within the review (0-based, contiguous)
- `kind` (`'prose' | 'annotation'`)
- `prose` (text, nullable) — required when `kind = 'prose'`
- `annotationId` (uuid, nullable, FK → annotations, on delete cascade) — required when `kind = 'annotation'`

A review is rendered by selecting its entries ordered by `position`. Imported reviews simply have no entries and render `bodyText` instead.

### `chunks` change
- `parentType` enum becomes `'paper' | 'review' | 'annotation'`.
- Annotation chunk: `parentType = 'annotation'`, `parentId = annotation.id`, `text = quote + "\n" + comment`, `collectionId` copied from the paper's collection, `page = annotation.page`, `chunkIndex = 0` (annotations are single-chunk), `charStart/charEnd` = the annotation's range.

## Reader & Annotation Flow

1. **Reader page** `/papers/[id]`: fetches the paper (`full_text`, `pageOffsets` are recomputable from stored data — see note) and its annotations. Renders the text as selectable paragraphs, each carrying its base character offset as a data attribute. Existing annotations render as `<mark>` spans over their ranges.
2. **Create**: the user selects text; a popover offers "Add note". The client computes `charStart`/`charEnd` from the DOM selection relative to `full_text`, captures the `quote`, and the user types a `comment`. `POST /api/annotations` with `{paperId, charStart, charEnd, quote, comment}`.
3. **Server on create**: validate the range, derive `page`, insert the annotation, then call `embedAnnotation` to create its chunk. The annotation is returned for immediate display.
4. **View/edit/delete**: clicking a highlight shows its comment with edit/delete. `PATCH /api/annotations/[id]` updates `comment` (re-embeds). `DELETE /api/annotations/[id]` removes the annotation and its chunk.

> **Page offsets note:** Phase 1 stores `full_text` but not `pageOffsets` on the paper row (offsets were only used transiently during ingestion). Phase 2 needs `page` for an annotation. Resolution: store `pageOffsets` on the paper at ingestion time. This is a small Phase 1 amendment — add a `pageOffsets` (jsonb int[]) column to `papers`, populated by the pipeline. Existing rows have it null; annotations on those default `page = null`. This is included in Phase 2's first task.

## Review Composition

1. **Composer** `/reviews/[id]/edit`: lists the review's entries in order. Controls:
   - **Add prose block** — a markdown text block appended at the end.
   - **Add annotation block** — pick from the current user's annotations (filterable by paper and by the review's collection); appends a block referencing that annotation.
   - **Reorder** — move a block up/down (swaps `position` with its neighbor).
   - **Edit/remove** — edit prose inline; remove any block (positions re-compacted).
2. **Assembled read view** `/reviews/[id]`: renders entries in order — prose as markdown; annotation blocks as the quoted passage + the comment, each linking back to `/papers/[paperId]` at the annotation's offset.
3. All composition routes require the review to exist and the user to be authenticated; reorder/remove operations re-normalize `position` to stay contiguous within a transaction.

## Annotation Embedding (chat integration)

- `embedAnnotation(annotationId, deps)`: loads the annotation, builds `text = quote + "\n" + comment`, embeds it via the `LLMProvider`, and **upserts** the annotation's chunk (one chunk per annotation, keyed by `parentType='annotation'` + `parentId=annotationId`). Skips embedding if both `quote` and `comment` are empty (removes any existing chunk instead).
- Called on annotation create and update; the chunk is deleted on annotation delete (FK cascade handles the row; the helper's delete path covers explicit cleanup).
- **`retrieve` extension**: when a retrieved chunk has `parentType = 'annotation'`, resolve its source by joining to the annotation → paper, producing `title = "Note on <paper.title>"`, `parentType = 'annotation'`, `parentId = annotation.id`, `page = annotation.page`. Chat's prompt and citation handling are otherwise unchanged.

## Error Handling

- Invalid ranges (`charEnd <= charStart`, out of bounds, non-existent paper) → 400.
- `embedAnnotation` failure does not lose the annotation: the annotation row is committed first; if embedding fails, the chunk is absent and the annotation is flagged for re-embed (an `embedError`/needs-embed signal), with a manual/automatic retry path. Annotations never enter a "lost" state.
- Reorder/remove run in a transaction so `position` never becomes inconsistent.
- All new API routes use the Phase 1 `requireUser` → 401 pattern and Zod validation.

## Testing Strategy

- **Unit**: DOM-selection→`{charStart,charEnd}` offset mapping; annotation chunk-text builder (`quote + comment`, empty handling); review-entry reorder/compaction logic (pure function over an entry list).
- **Integration** (real Neon): annotation create inserts row + chunk; update re-embeds; delete removes both; review compose adds/reorders/removes entries with contiguous positions; `retrieve` returns an annotation chunk with `title = "Note on …"`; chat cites an annotation.
- **Light E2E**: create an annotation on an ingested paper, then a chat query whose answer cites that annotation.

## Watch-Items / Risks

1. **Selection→offset robustness.** Mapping a browser selection to exact `full_text` offsets is the trickiest piece; the reader renders text in offset-tagged segments so the mapping is deterministic. Covered by a focused unit test over the mapping helper.
2. **`full_text` whitespace fidelity.** Highlights rely on the client rendering the same `full_text` the offsets were computed against; the reader must render it verbatim (preserving the exact characters), not a re-formatted version.
3. **Annotation chunk churn.** Editing a comment re-embeds (one OpenAI embed call per save) — negligible cost at team scale.

## Phasing reminder
- **Phase 1 (done):** foundation + import + citation-grounded chat.
- **Phase 2 (this doc):** in-app reading, paper-level annotations, review assembly, annotation-aware chat.
- **Phase 3:** synthesis — literature matrix, theme/tag synthesis, contradiction/gap detection, export, automatic citation→paper linking.
