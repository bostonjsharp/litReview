# Phase 4d — Matrix Small-Screen UX (Design)

Date: 2026-06-04
Status: approved (design approved inline)
Backlog item: FEAT-4

## Goal

Make the literature matrix usable on small/half screens: fill the content area with a
bounded-height scroll (so the existing sticky header + first column actually work), and
tighten column widths responsively so more fits before scrolling.

Final slice of Phase 4. **CSS-only** (plus one class on the matrix page wrapper).

## Decision

Full-bleed + responsive grid (no stacked card view — the matrix stays a table; very wide
matrices still scroll horizontally).

## Current state

- `MatrixGrid.tsx` already has sticky `thead th` (header), sticky `tbody th` / `.corner`
  (first column), and `.matrix-scroll { overflow: auto }` (`screens.css:115-126`).
- `.matrix { min-width: 900px }`, first column `min-width: 240px`, cells `min-width: 200px`.
- The matrix page (`…/collections/[cid]/matrix/page.tsx`) renders inside the shell's
  centered `.app-canvas { max-width: 1080px; margin: 0 auto; padding: … }` (the same
  constraint that hampered chat), and its `height: 100%` flex column does not resolve to a
  bounded height there — so the sole-scroller/sticky behavior is unreliable and width is
  capped/padded.

## Architecture

1. **Full-bleed.** Add `className="matrix-page"` to the matrix page's outer wrapper
   `<div style={{ display:'flex', flexDirection:'column', height:'100%' }}>`. Add
   `.app-canvas:has(.matrix-page) { max-width: none; margin: 0; padding: 0; height: 100% }`
   so the matrix fills the content area with a definite height → `.matrix-scroll`
   (flex:1, overflow:auto) becomes the bounded scroller and the existing sticky header /
   first column work. Give the page-head area horizontal padding so the title/controls
   aren't flush to the edge (the `.matrix-scroll` already has its own horizontal padding).

2. **Responsive sizing** (`@media (max-width: 900px)`): drop `.matrix { min-width }` to 0
   so the table can shrink; tighten `.matrix thead th.corner` / `.matrix tbody th`
   `min/max-width` 240→150px and `.matrix td` min-width 200→140px; reduce cell padding.
   More columns fit on a half-screen; sticky paper column + theme header keep context.

3. No component logic change beyond the wrapper class.

## Testing

CSS-only — no unit-testable logic. Verified by `npx next build` (CSS compiles) + a manual
resize / half-screen check (the point of the slice). The `:has()` selector is widely
supported; matches the chat full-bleed approach already shipped.

## Out of scope

- Stacked/card view at phone widths; column reordering; freezing multiple columns.

## Risks / notes

- Removing `.app-canvas` padding for the matrix means the page head must carry its own
  horizontal padding — verify the title/Suggest-themes control aren't flush.
- Keep the change scoped to the matrix; `.app-canvas:has(.matrix-page)` only affects the
  matrix route.
