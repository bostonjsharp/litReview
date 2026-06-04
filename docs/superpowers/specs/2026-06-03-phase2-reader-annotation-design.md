# Phase 2 — Reader & Annotation Upgrade (Design)

Date: 2026-06-03
Status: approved (pending spec review)
Backlog items: BUG-4, BUG-5, BUG-9 (reader side), and FEAT-2 (superseded — see below)

## Goal

Make the paper reader better at the one thing it exists for: reading, annotating, and
navigating a paper by theme. Four focused changes, **no database/schema migrations** —
every piece is a deletion, client-side behavior, or reuse of an existing API.

## Decisions made during brainstorming

- **Multi-color highlights (FEAT-2) are dropped.** Highlights can carry multiple themes
  (`annotationThemes` is many-to-many) and real collections have 10–15+ themes, so
  "color = theme" breaks on multi-theme highlights and exhausts the ~6–8 colors a person
  can distinguish. Colors fight LitReview's strength (rich overlapping tagging).
  Replaced by a **theme focus filter** (item 3).
- **The reader settings gear is removed,** not filled in. There is no essential reading
  setting today; a dead/half button is worse than none.
- Theme focus filter **dims** non-matching highlights (keeps reading context) rather than
  hiding them.
- Deep-linking anchors by **annotation id** (`?ann=<id>`) now. Raw character-offset
  anchoring (`?at=<charStart>`) is deferred to Phase 3, when chat needs to point at
  passages that aren't annotations.

## Scope

In scope (all in the reader, `src/components/AnnotationReader.tsx` + the immersive paper
page that renders it):

1. **Remove the settings gear** (BUG-4).
2. **Create a theme while highlighting** (BUG-5).
3. **Theme focus filter** in the reader (replaces FEAT-2).
4. **Deep-link to a passage** via `?ann=<id>` (BUG-9, reader side only).

Out of scope (later phases):
- Chat citation deep-linking and `?at=<charStart>` anchoring → Phase 3 (reuses item 4's anchor).
- Any review/matrix redesign → Phase 4.

---

## 1. Remove the settings gear (BUG-4)

Delete the dead button at `AnnotationReader.tsx:415-417`
(`title="Reading settings (coming soon)"`). The topbar keeps the back link, the notes
count, and the grow spacer. No other change.

**Done when:** the gear is gone and the topbar still renders correctly.

---

## 2. Create a theme while highlighting (BUG-5)

### Problem
`ThemePop` only lists existing themes and shows "No themes in this collection" when empty
— there is no way to create one. The reader is not passed a `collectionId`, which the
create API needs.

### Design
- **Plumb `collectionId`** into `AnnotationReader` as a prop. The immersive paper page
  already loads the paper row, which has `collectionId`; pass it through. If a paper has
  no collection (`collectionId` null), theme creation is disabled with a short hint
  ("Add this paper to a collection to use themes") — themes are collection-scoped.
- **Add a "+ New theme…" affordance at the bottom of `ThemePop`:** a small text input +
  confirm. On submit:
  1. `POST /api/collections/[collectionId]/themes` with `{ name }`.
  2. On success, add the returned theme to the reader's local `themes` list (so it appears
     in every picker) and **auto-select it** on the current draft/note.
  3. On failure, show an inline error inside the pop; do not close it.
- Trim input; ignore empty; a duplicate name is allowed by the backend (no extra client
  guard) — keep it simple.

### Components touched
- `AnnotationReader.tsx`: new `collectionId` prop; lift `themes` into state so a created
  theme is immediately usable; pass an `onCreateTheme` handler into `ThemePop`.
- `ThemePop`: render the create input + wire submit.
- The immersive paper page: pass `collectionId`.

**Done when:** from an empty collection, a user can select text → "Highlight & note" →
"+ New theme" → type a name → it is created, selected on the note, and saved; the new
theme appears in subsequent pickers without a page reload.

---

## 3. Theme focus filter (replaces FEAT-2)

### Problem
"Which highlight belongs to which theme?" is currently unanswerable at a glance, and the
filter button in the notes rail (`AnnotationReader.tsx:481-483`) is inert.

### Design
- Wire the rail's **filter button** to open a theme list (reuse the `ThemePop`/menu
  styling) plus an explicit **"All themes"** reset entry.
- Selecting a theme sets `focusThemeId` state:
  - **Document:** highlights whose annotation is tagged with `focusThemeId` keep the
    normal `.hl` emphasis; all other highlights get a dimmed class (e.g. `.hl-dim`,
    reduced opacity). Plain text is untouched. Membership is derived from the existing
    `tagsByAnnotation` map — no new data.
  - **Notes rail:** show only notes tagged with `focusThemeId`. A small banner indicates
    the active filter with a one-click clear.
- "All themes" clears `focusThemeId` (everything back to normal).
- Multi-theme highlights naturally appear under each of their themes, because membership
  is a per-theme check, not a single color.

### Components touched
- `AnnotationReader.tsx`: `focusThemeId` state; dim class in `renderParagraph` based on
  the active annotation's tags; filter the rendered notes list; filter menu + banner.
- `screens.css` (style layer): add `.hl-dim` (and any filter-banner class) using existing
  tokens.

**Done when:** picking a theme dims unrelated highlights and filters the rail to that
theme; "All themes" restores the full view; works with 0, 1, and many themes and with
highlights that have multiple themes.

---

## 4. Deep-link to a passage (BUG-9, reader side)

### Problem
`activateMark` scrolls the *note card* into view but never the *in-document passage*, and
marks have no stable anchor, so nothing can link to a specific highlight.

### Design
- **Stable anchor:** give the *first* `<mark>` of each annotation `id="hl-<annId>"`.
  (`sliceSegment` can yield multiple parts per annotation across paragraph splits; only
  the first part of a given `annId` gets the id.)
- **On load:** read `?ann=<id>` from the URL. If present and the annotation exists:
  1. set it active,
  2. scroll the document to `#hl-<id>` (`scrollIntoView`, `block: 'center'`),
  3. **flash** it briefly (add a `.hl-flash` class for ~1.2s, then remove) so the eye
     lands on it,
  4. also scroll the matching note card into the rail (existing behavior).
- **Extend `activateMark`:** clicking a highlight already activates the note; clicking a
  *note card* should also scroll the document to its `#hl-<id>` (bidirectional nav).
- **Producers:** update existing in-app annotation references to link with `?ann=<id>` —
  the literature matrix cells and any collection/paper view that links into a paper at a
  specific note. (Scan for links to `/workspaces/[id]/papers/[pid]` that represent a
  specific annotation.)

### Components touched
- `AnnotationReader.tsx`: anchor id on first mark; `useEffect` reading `?ann=`; flash
  class lifecycle; note-card click also scrolls the document.
- `MatrixGrid.tsx` (and any other annotation-reference producer): append `?ann=<id>` to
  the paper link.
- `screens.css`: `.hl-flash` keyframe pulse.

### Edge cases
- `?ann=` pointing at a deleted/unknown annotation → no-op (no scroll, no error).
- Annotation present but its mark not rendered (empty/again edge) → guard on the element
  existing before scrolling.

**Done when:** visiting `…/papers/<pid>?ann=<annId>` scrolls to and flashes that
highlight and activates its note; clicking a note card scrolls the document to its
highlight; matrix cells link into the paper at the right note.

---

## Testing strategy

Most of Phase 2 is client behavior in a `'use client'` component, which this repo does
not currently render-test (tests target `lib/` logic against the Neon test DB). To keep
TDD meaningful, **extract pure helpers and test those**, and keep the JSX as a thin shell:

- **Theme focus filter:** extract a pure `isDimmed(annId, focusThemeId, tagsByAnnotation)`
  / `visibleNotes(notes, focusThemeId, tags)` helper → unit tests (0/1/many themes,
  multi-theme highlight matches multiple filters).
- **Deep-link anchor:** extract `firstMarkAnnId(parts)` (or assert that `sliceSegment`
  output lets us pick the first part per annId) → unit test that only the first part of a
  repeated annId is anchored.
- **Create theme:** the API route already exists and is integration-covered via
  `theme-service.test.ts`; add a unit test for any new client-side
  validation/normalization helper (e.g. trim/empty-guard) if one is introduced.

No new integration tests are required (no schema/route changes except none here). Run the
full suite + `tsc` + `eslint` before completion, matching Phase 1's bar.

## Risks / notes

- `themes` becomes reader-local state (created themes appear without reload). Ensure the
  initial prop seeds state once.
- Dimming must target only annotation marks, never body text, and must be purely visual
  (no change to selection/offset math).
- Keep the flash class self-cleaning (timeout cleared on unmount) to match the existing
  timer-cleanup discipline in this component.
