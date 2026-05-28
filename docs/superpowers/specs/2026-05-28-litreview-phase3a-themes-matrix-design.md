# LitReview — Phase 3a Design: Themes & Literature Matrix

**Date:** 2026-05-28
**Status:** Approved (design)
**Builds on:** Phase 1 (foundation/chat) and Phase 2 (annotations). See those design docs.
**Scope:** The first slice of Phase 3. The other Phase 3 slices — contradiction/gap detection, export, and automatic citation→paper linking — are separate cycles and out of scope here.

## Context & Goals

Phase 2 lets the team highlight passages and attach comments (paper-level annotations). Phase 3a turns those annotations into a **literature matrix**: a papers × themes grid where each cell shows the annotations of that paper tagged with that theme. This is the classic synthesis artifact of a literature review, kept fully traceable to source passages.

Decisions from brainstorming:
- **A matrix cell is derived from tagged annotations** — not a stored free-text summary. Tagging an annotation with a theme is the unit of work; the matrix is a computed view. This reuses Phase 2 and keeps every cell traceable to a source passage.
- **Themes are scoped to a collection** (a research question).
- **Manual tagging, with optional LLM suggestions.** The user creates themes and tags annotations; they may also ask the LLM to suggest themes (by reading the collection's annotations) and propose taggings. Suggestions are **non-destructive**: nothing is created or tagged until the user explicitly applies them.
- **LLM suggestion is a single `complete()` call** over the collection's annotation texts, not embedding clustering. Predictable and simple at a team's scale.
- **The matrix is derived, not stored** — computed from `themes` + `annotation_themes` + annotations on demand.

## Non-Goals (Phase 3a)

- Contradiction & gap detection (later slice).
- Export to Markdown/Word/BibTeX (later slice).
- Automatic citation→paper linking (later slice).
- Manual per-cell free-text summaries (cells are derived from annotations only).
- Cross-collection themes (themes belong to one collection).
- Automatic/continuous re-clustering; suggestion is an explicit, on-demand action.

## Architecture

Extends the existing app. Adds:
- Two tables: `themes` and `annotation_themes` (join).
- A pure `assembleMatrix(...)` shaping function and a derived matrix API route.
- Theme CRUD routes and annotation-tagging routes.
- An LLM theme-suggestion route (suggest) and an apply route (create themes + tag), kept separate so the LLM never mutates data directly.
- One method on `LLMProvider`: `complete(prompt: string): Promise<string>`, implemented by `OpenAIProvider` as a JSON-mode chat completion. `embed()` and `chat()` are unchanged. This remains the single provider swap point.
- UI: a matrix grid page, theme management, a suggestion review/apply flow, and theme chips on annotations in the Phase 2 reader.

## Data Model

### `themes`
- `id` (uuid, pk)
- `collectionId` (uuid, FK → collections, on delete cascade)
- `name` (text, not null)
- `createdBy` (uuid, FK → users, nullable)
- `createdAt` (timestamp)

### `annotation_themes` (join)
- `annotationId` (uuid, FK → annotations, on delete cascade)
- `themeId` (uuid, FK → themes, on delete cascade)
- Primary key = (`annotationId`, `themeId`). Tagging is idempotent (`onConflictDoNothing`).

No matrix table: the matrix is computed from these tables plus the paper-level annotations.

## The Matrix (derived)

- `GET /api/collections/[id]/matrix` returns:
  ```
  {
    themes: { id, name }[],
    papers: { id, title }[],
    cells: { [paperId: string]: { [themeId: string]: AnnotationCell[] } }
  }
  ```
  where `AnnotationCell = { id, quote, comment, page }`.
- **Rows** = papers in the collection; **columns** = the collection's themes; a `cells[paperId][themeId]` entry lists that paper's annotations tagged with that theme (absent/empty when none).
- A pure function `assembleMatrix(papers, themes, taggedAnnotations)` does the shaping and is unit-tested; the route only runs the queries and feeds it. `taggedAnnotations` is the flat list of `{ annotationId, paperId, themeId, quote, comment, page }` rows from joining annotations ↔ annotation_themes.
- The matrix UI renders the grid; clicking a cell annotation links to `/papers/[paperId]` at the annotation's offset (reusing the Phase 2 reader).

## Tagging (manual)

- **Theme CRUD** (scoped to a collection): `POST /api/collections/[id]/themes` (create `{name}`), `PATCH /api/themes/[id]` (rename), `DELETE /api/themes/[id]` (delete; cascades its tags).
- **Tag/untag an annotation**: `POST /api/annotations/[id]/themes` `{themeId}` and `DELETE /api/annotations/[id]/themes/[themeId]`.
- In the Phase 2 reader, each annotation shows **theme chips**: the themes it's tagged with, plus a control to add an existing collection theme or remove one.

## LLM Theme Suggestion (optional, non-destructive)

- `POST /api/collections/[id]/suggest-themes`:
  1. Loads the collection's annotations (`{annotationId, quote, comment}`).
  2. Builds a prompt asking for strict JSON: `{ "themes": string[], "assignments": [{ "annotationId": string, "themes": string[] }] }` (theme names in `assignments` must come from the proposed `themes`).
  3. Makes **one** `llm.complete(prompt)` call, parses the JSON, validates the shape, and returns the suggestion. **Nothing is written.**
- The UI presents proposed themes and per-annotation assignments; the user edits/accepts.
- **Apply** is a separate, explicit step using existing routes (create the chosen themes, then tag annotations) — so the suggestion endpoint is read-only and the LLM never mutates data.
- A pure `parseSuggestion(raw: string)` function parses/validates the model output (returns a typed result or throws on malformed JSON), unit-tested independently of the network.

## LLM Provider Extension

Add to the `LLMProvider` interface:
```ts
complete(prompt: string): Promise<string>;
```
`OpenAIProvider.complete` issues a single chat completion (JSON-mode, cheap model) and returns the raw message content. Existing `embed`/`chat` are untouched. Any future provider implements `complete` alongside them.

## Error Handling

- `suggest-themes` failures (LLM error, malformed JSON) return a 4xx/5xx with a message and change nothing; the user can retry. Because suggestions are non-destructive, a failure never corrupts data.
- Theme delete cascades `annotation_themes`. Tagging uses `onConflictDoNothing` (idempotent).
- Tagging a non-existent theme/annotation, or a theme from a different collection than the annotation's paper, returns 400.
- All new routes use the Phase 1 `requireUser`→401 pattern and Zod validation.

## Testing Strategy

- **Unit**: `assembleMatrix` shaping (papers × themes grid, empty cells, multi-tag annotations); `parseSuggestion` (valid JSON, malformed JSON, theme names not in the proposed set).
- **Integration** (real Neon): theme CRUD; tag/untag (idempotent, cascade on delete); `GET .../matrix` returns correct cell contents across two papers/themes; `suggest-themes` with a mocked `complete()` returns parsed suggestions and writes nothing.
- **Light E2E**: create a theme, tag annotations on two papers with it, and assert the matrix endpoint places each annotation in the correct `(paper, theme)` cell.

## Watch-Items / Risks

1. **Suggestion output validity.** The model may return malformed JSON or invent annotation IDs/theme names. `parseSuggestion` validates the shape and that assignment theme names exist in the proposed set; unknown annotation IDs are dropped. Covered by unit tests.
2. **Matrix size.** Rendering is fine at a team's scale (tens of papers × a handful of themes). If a collection grows large, the grid may need virtualization — noted, not built.
3. **Theme/collection coherence.** Tagging is constrained so an annotation is only tagged with themes from its paper's collection, keeping each matrix self-consistent.

## Phasing reminder
- **Phase 1 (done):** foundation + import + citation-grounded chat.
- **Phase 2 (done):** in-app reading, annotations, review assembly, annotation-aware chat.
- **Phase 3a (this doc):** themes + literature matrix.
- **Phase 3 remaining (later):** contradiction/gap detection; export (BibTeX/Word/Markdown); automatic citation→paper linking.
