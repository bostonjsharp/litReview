# Phase 4d — Matrix Small-Screen UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Full-bleed the literature matrix with a bounded-height scroll and tighten columns responsively on small/half screens.

**Architecture:** A `matrix-page` class on the matrix page wrapper + `.app-canvas:has(.matrix-page)` full-bleed + a `@media (max-width: 900px)` block. CSS-only.

Spec: `docs/superpowers/specs/2026-06-04-phase4d-matrix-responsive-design.md`

## File map
- `src/app/workspaces/[id]/(app)/collections/[cid]/matrix/page.tsx` — wrapper class + head padding (modify)
- `src/app/styles/screens.css` — full-bleed + responsive rules (modify)

---

### Task 1: Full-bleed + responsive matrix CSS

**Files:** matrix `page.tsx`; `src/app/styles/screens.css`

- [ ] **Step 1: Mark the matrix page wrapper + pad the head**

In `…/collections/[cid]/matrix/page.tsx`, change the outer wrapper to carry a class, and give the page-head area horizontal padding (so it isn't flush once the canvas padding is removed):

```tsx
    <div className="matrix-page" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 'none', padding: '0 var(--s6)' }}>
        <PageHead eyebrow={collection.name} title="Literature matrix">
          <SuggestThemesPanel collectionId={cid} />
        </PageHead>
      </div>
      <MatrixGrid matrix={matrix} workspaceId={id} />
    </div>
```

- [ ] **Step 2: Add the CSS** — append to `src/app/styles/screens.css`:

```css
/* Matrix fills the content area (bounded height → sticky header/first column work and
   the full width is usable), opting out of the shell's centered, padded .app-canvas. */
.app-canvas:has(.matrix-page) {
  max-width: none;
  margin: 0;
  padding: 0;
  height: 100%;
}

/* Small / half screens: let the table shrink and tighten columns so more fits before
   horizontal scroll; the sticky paper column + theme header keep context. */
@media (max-width: 900px) {
  .matrix { min-width: 0; }
  .matrix thead th.corner,
  .matrix tbody th { min-width: 150px; max-width: 150px; }
  .matrix td { min-width: 140px; }
  .matrix thead th,
  .matrix tbody th,
  .matrix td { padding: 10px 12px; }
}
```

- [ ] **Step 3: Verify** — `npx tsc --noEmit` (no new src errors) + `npx eslint "src/app/workspaces/[id]/(app)/collections/[cid]/matrix/page.tsx"` (0 errors) + `npx next build` (CSS compiles).

- [ ] **Step 4: Manual check** — open a collection matrix; at full width it fills the area with sticky header + first column working while scrolling; narrow the window to a half-screen → more columns fit, columns tighten, sticky context holds, horizontal scroll for the rest. The page head title/Suggest-themes aren't flush to the edge.

- [ ] **Step 5: Commit**

```bash
git add "src/app/workspaces/[id]/(app)/collections/[cid]/matrix/page.tsx" src/app/styles/screens.css
git commit -m "feat(matrix): full-bleed + responsive small-screen layout (FEAT-4)"
```

---

### Task 2: Verification + backlog

- [ ] **Step 1: Suite** — `npx vitest run` → green (no logic changed; sanity only).
- [ ] **Step 2: Build** — `npx next build` → succeeds.
- [ ] **Step 3: Backlog** — mark FEAT-4 done in `docs/BACKLOG.md` (full-bleed matrix, bounded sticky scroll, responsive columns). Commit.

---

## Self-Review

**Spec coverage:** full-bleed via `:has(.matrix-page)` + bounded height → Task 1 Step 2 ✓; responsive column sizing → Task 1 Step 2 media query ✓; head padding so not flush → Task 1 Step 1 ✓; CSS-only, verified by build + manual → Tasks 1, 2 ✓.

**Placeholder scan:** none. **Type consistency:** N/A (CSS + a className). The `:has(.matrix-page)` mirrors the already-shipped `:has(.chat-layout)` full-bleed pattern.
