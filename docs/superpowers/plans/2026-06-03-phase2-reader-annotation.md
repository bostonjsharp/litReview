# Phase 2 — Reader & Annotation Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the paper reader — remove the dead settings gear, let users create a theme while highlighting, add a theme focus filter, and deep-link to a specific highlight via `?ann=<id>`.

**Architecture:** All changes live in the reader (`src/components/AnnotationReader.tsx`) and its immersive page, plus the matrix link producer. Behavior-bearing logic is extracted into three pure helpers (theme-name normalization, theme-focus matching, first-occurrence anchoring) that are unit-tested TDD-style; the surrounding `'use client'` JSX is verified by `tsc` + `eslint` + a manual check, matching this repo's existing testing boundary (it tests `lib/` logic, not React render).

**Tech Stack:** Next.js (App Router) client components, TypeScript, Vitest (unit tests in `tests/unit/`), class-based CSS in `src/app/styles/screens.css`.

**No database/schema changes in this phase.**

Spec: `docs/superpowers/specs/2026-06-03-phase2-reader-annotation-design.md`

---

### Task 1: Remove the dead settings gear (BUG-4)

**Files:**
- Modify: `src/components/AnnotationReader.tsx` (the reader topbar, around lines 414-417)

- [ ] **Step 1: Delete the gear button**

In `AnnotationReader.tsx`, find this block in the reader topbar:

```tsx
          <span className="meta">{annotations.length} notes</span>
          <button className="btn-icon" title="Reading settings (coming soon)" aria-label="Reading settings">
            <Icon name="settings" size={17} />
          </button>
```

Replace it with just the notes count (drop the button entirely):

```tsx
          <span className="meta">{annotations.length} notes</span>
```

- [ ] **Step 2: Verify build + lint are clean**

Run: `npx tsc --noEmit` (expect no NEW errors beyond the pre-existing `tests/ui/*` ones) and `npx eslint src/components/AnnotationReader.tsx`
Expected: 0 errors for the changed file.

- [ ] **Step 3: Commit**

```bash
git add src/components/AnnotationReader.tsx
git commit -m "feat(reader): remove dead settings gear (BUG-4)"
```

---

### Task 2: `normalizeThemeName` pure helper (TDD)

**Files:**
- Create: `src/lib/themes/name.ts`
- Test: `tests/unit/theme-name.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/theme-name.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { normalizeThemeName } from '@/lib/themes/name';

describe('normalizeThemeName', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeThemeName('  Attention  ')).toBe('Attention');
  });
  it('returns null for empty or whitespace-only input', () => {
    expect(normalizeThemeName('')).toBeNull();
    expect(normalizeThemeName('   ')).toBeNull();
  });
  it('keeps a valid single-character name', () => {
    expect(normalizeThemeName('A')).toBe('A');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/theme-name.test.ts`
Expected: FAIL — "Cannot find module '@/lib/themes/name'".

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/themes/name.ts`:

```ts
// Normalizes a user-typed theme name. Returns the trimmed name, or null when there
// is nothing meaningful to create (empty / whitespace-only).
export function normalizeThemeName(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/theme-name.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/themes/name.ts tests/unit/theme-name.test.ts
git commit -m "feat(themes): add normalizeThemeName helper"
```

---

### Task 3: Create a theme while highlighting (BUG-5)

Plumb `collectionId` into the reader, lift `themes` to state, add an inline "create theme" affordance to `ThemePop`, and auto-select the created theme.

**Files:**
- Modify: `src/app/workspaces/[id]/(immersive)/papers/[pid]/page.tsx` (pass `collectionId`)
- Modify: `src/components/AnnotationReader.tsx` (prop, themes state, create handler, ThemePop)

- [ ] **Step 1: Pass `collectionId` from the page**

In `src/app/workspaces/[id]/(immersive)/papers/[pid]/page.tsx`, add a `collectionId` prop to the `<AnnotationReader ... />` element (the paper row already has `collectionId`):

```tsx
    <AnnotationReader
      paperId={paper.id}
      collectionId={paper.collectionId}
      fullText={paper.fullText ?? ''}
```

(Insert the `collectionId` line immediately after `paperId`; leave all other props unchanged.)

- [ ] **Step 2: Add the prop + import to the reader**

In `AnnotationReader.tsx`, add the import near the other `@/lib` imports:

```tsx
import { normalizeThemeName } from '@/lib/themes/name';
```

Add to the `Props` interface:

```tsx
  paperId: string;
  collectionId: string | null;
  fullText: string;
```

Add `collectionId` to the destructured params and rename the `themes` param to `initialThemes`:

```tsx
export function AnnotationReader({
  paperId,
  collectionId,
  fullText,
  paper,
  pageCount,
  annotations: initialAnnotations,
  themes: initialThemes,
  tagsByAnnotation: initialTagsByAnnotation,
  backHref,
  backLabel,
}: Props) {
```

- [ ] **Step 3: Lift themes into state + add the create handler**

Just below `const [annotations, setAnnotations] = useState<Annotation[]>(initialAnnotations);` add:

```tsx
  const [themes, setThemes] = useState<Theme[]>(initialThemes);
```

Add this handler near the other theme handlers (e.g. after `removeThemeFromNote`):

```tsx
  // Creates a collection theme inline and adds it to local state so every picker sees it.
  // Returns the new theme (so the caller can select it) or null on no-op/failure.
  async function createThemeInline(name: string): Promise<Theme | null> {
    if (!collectionId) return null;
    const clean = normalizeThemeName(name);
    if (!clean) return null;
    const res = await fetch(`/api/collections/${collectionId}/themes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: clean }),
    });
    if (!res.ok) return null;
    const theme = (await res.json()) as Theme;
    setThemes((prev) => (prev.some((t) => t.id === theme.id) ? prev : [...prev, theme]));
    return theme;
  }
```

- [ ] **Step 4: Add the create input to `ThemePop`**

Replace the `ThemePop` component (the whole function near the top of the file) with this version that adds a "+ New theme" input and a `canCreate` / `onCreate` contract:

```tsx
function ThemePop({
  themes,
  activeThemeIds,
  onPick,
  close,
  canCreate,
  onCreate,
}: {
  themes: Theme[];
  activeThemeIds: string[];
  onPick: (id: string) => void;
  close: () => void;
  canCreate: boolean;
  onCreate: (name: string) => Promise<Theme | null>;
}) {
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  async function submitNew() {
    if (creating) return;
    setCreating(true);
    const theme = await onCreate(newName);
    setCreating(false);
    if (theme) {
      setNewName('');
      onPick(theme.id); // auto-select the freshly created theme
    }
  }

  return (
    <>
      <div className="menu-scrim" onClick={close} />
      <div className="theme-pop fade-enter" style={{ top: 28, left: 0 }}>
        {themes.map((t) => (
          <button
            key={t.id}
            onClick={(e) => {
              e.stopPropagation();
              onPick(t.id);
            }}
          >
            <span className="tp-dot" /> {t.name}
            {activeThemeIds.includes(t.id) && (
              <Icon name="check" size={14} style={{ marginLeft: 'auto', color: 'var(--accent)' }} />
            )}
          </button>
        ))}
        {canCreate ? (
          <div className="theme-pop-new" style={{ display: 'flex', gap: 4, padding: '6px 8px' }}>
            <input
              className="input"
              style={{ height: 30, fontSize: 13 }}
              placeholder="New theme…"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.stopPropagation();
                  submitNew();
                }
              }}
              disabled={creating}
            />
            <button
              className="btn btn-primary btn-sm"
              onClick={(e) => {
                e.stopPropagation();
                submitNew();
              }}
              disabled={creating || normalizeThemeName(newName) === null}
              aria-label="Create theme"
            >
              <Icon name="plus" size={12} />
            </button>
          </div>
        ) : (
          // A paper with no collection has no collection-scoped themes to show or create.
          <p style={{ padding: '6px 10px', fontSize: 12, color: 'var(--faint)' }}>
            Add this paper to a collection to use themes.
          </p>
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 5: Pass the new props at both `ThemePop` call sites**

There are two `<ThemePop ... />` usages (one for the draft compose card, one for saved notes). Add `canCreate` and `onCreate` to both. For the draft usage:

```tsx
                {themePopFor === 'draft' && (
                  <ThemePop
                    themes={themes}
                    activeThemeIds={draft.themes}
                    onPick={(id) => {
                      toggleDraftTheme(id);
                    }}
                    close={() => setThemePopFor(null)}
                    canCreate={collectionId != null}
                    onCreate={createThemeInline}
                  />
                )}
```

For the saved-note usage:

```tsx
                  {themePopFor === a.id && (
                    <ThemePop
                      themes={themes}
                      activeThemeIds={noteThemeIds}
                      onPick={(id) => {
                        if (noteThemeIds.includes(id)) {
                          removeThemeFromNote(a.id, id);
                        } else {
                          addThemeToNote(a.id, id);
                        }
                      }}
                      close={() => setThemePopFor(null)}
                      canCreate={collectionId != null}
                      onCreate={createThemeInline}
                    />
                  )}
```

- [ ] **Step 6: Verify build + lint**

Run: `npx tsc --noEmit` and `npx eslint src/components/AnnotationReader.tsx "src/app/workspaces/[id]/(immersive)/papers/[pid]/page.tsx"`
Expected: no new errors.

- [ ] **Step 7: Manual check**

Run `npm run dev`, open a paper in a collection that has zero themes, select text → "Highlight & note" → "+ theme" → type a name → press Enter. Expected: theme is created, selected (chip appears), and persists after saving the note; the same theme appears in the picker on other notes without reload.

- [ ] **Step 8: Commit**

```bash
git add src/components/AnnotationReader.tsx "src/app/workspaces/[id]/(immersive)/papers/[pid]/page.tsx"
git commit -m "feat(reader): create themes inline while highlighting (BUG-5)"
```

---

### Task 4: `matchesThemeFocus` / `isDimmed` pure helpers (TDD)

**Files:**
- Create: `src/lib/annotate/themeFilter.ts`
- Test: `tests/unit/theme-filter.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/theme-filter.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { matchesThemeFocus, isDimmed } from '@/lib/annotate/themeFilter';

const tags = { a1: ['t1', 't2'], a2: ['t2'], a3: [] as string[] };

describe('matchesThemeFocus', () => {
  it('matches everything when no theme is focused', () => {
    expect(matchesThemeFocus('a3', null, tags)).toBe(true);
  });
  it('matches a highlight tagged with the focused theme', () => {
    expect(matchesThemeFocus('a1', 't2', tags)).toBe(true);
    expect(matchesThemeFocus('a2', 't2', tags)).toBe(true);
  });
  it('does not match a highlight lacking the focused theme', () => {
    expect(matchesThemeFocus('a2', 't1', tags)).toBe(false);
    expect(matchesThemeFocus('a3', 't1', tags)).toBe(false);
  });
  it('treats an unknown annotation as no tags', () => {
    expect(matchesThemeFocus('zzz', 't1', tags)).toBe(false);
  });
});

describe('isDimmed', () => {
  it('dims nothing when no theme is focused', () => {
    expect(isDimmed('a2', null, tags)).toBe(false);
  });
  it('dims a highlight that lacks the focused theme', () => {
    expect(isDimmed('a2', 't1', tags)).toBe(true);
  });
  it('does not dim a highlight that has the focused theme', () => {
    expect(isDimmed('a1', 't1', tags)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/theme-filter.test.ts`
Expected: FAIL — "Cannot find module '@/lib/annotate/themeFilter'".

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/annotate/themeFilter.ts`:

```ts
// Theme focus filter logic. A highlight "matches" the focus when no theme is focused,
// or when the focused theme is among the highlight's tags. Multi-theme highlights match
// any of their themes — which is exactly why one theme can be spotlighted at a time
// without a color budget.
export function matchesThemeFocus(
  annId: string,
  focusThemeId: string | null,
  tags: Record<string, string[]>,
): boolean {
  if (!focusThemeId) return true;
  return (tags[annId] ?? []).includes(focusThemeId);
}

export function isDimmed(
  annId: string,
  focusThemeId: string | null,
  tags: Record<string, string[]>,
): boolean {
  return focusThemeId != null && !matchesThemeFocus(annId, focusThemeId, tags);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/theme-filter.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/annotate/themeFilter.ts tests/unit/theme-filter.test.ts
git commit -m "feat(reader): add theme-focus filter helpers"
```

---

### Task 5: Theme focus filter UI + dim (replaces FEAT-2)

Wire the inert rail filter button: pick a theme → its highlights stay lit, others dim, the notes rail filters to it, a banner offers a one-click clear.

**Files:**
- Modify: `src/components/AnnotationReader.tsx`
- Modify: `src/app/styles/screens.css`

- [ ] **Step 1: Add the dim CSS**

Append to `src/app/styles/screens.css`:

```css
/* Theme focus filter — dim highlights that don't match the focused theme */
.hl.hl-dim {
  opacity: 0.3;
  transition: opacity 0.15s ease;
}
.reader-filter-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  margin: 4px 0 8px;
  font-size: 13px;
  color: var(--muted);
  background: var(--accent-faint, rgba(0, 0, 0, 0.04));
  border-radius: 6px;
}
```

- [ ] **Step 2: Add imports + filter state**

In `AnnotationReader.tsx`, extend the themeFilter import (add to the existing `@/lib` imports):

```tsx
import { matchesThemeFocus, isDimmed } from '@/lib/annotate/themeFilter';
```

Add state near the other `useState` hooks:

```tsx
  const [focusThemeId, setFocusThemeId] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
```

- [ ] **Step 3: Dim non-matching highlights in `renderParagraph`**

In `renderParagraph`, change the `<mark>` className to include the dim class when the annotation doesn't match the current focus:

```tsx
      const isActive = activeId === part.annId;
      const dim = isDimmed(part.annId!, focusThemeId, tagsByAnnotation);
      return (
        <mark
          key={i}
          className={'hl' + (isActive ? ' active' : '') + (dim ? ' hl-dim' : '')}
```

- [ ] **Step 4: Wire the filter button + menu in the notes head**

Replace the notes-head block:

```tsx
        <div className="notes-head">
          <h3>
            Notes <span className="meta">{annotations.length}</span>
          </h3>
          <button className="btn-icon" title="Filter by theme" aria-label="Filter by theme">
            <Icon name="filter" size={16} />
          </button>
        </div>
```

with:

```tsx
        <div className="notes-head" style={{ position: 'relative' }}>
          <h3>
            Notes <span className="meta">{annotations.length}</span>
          </h3>
          <button
            className="btn-icon"
            title="Filter by theme"
            aria-label="Filter by theme"
            onClick={() => setFilterOpen((o) => !o)}
          >
            <Icon name="filter" size={16} />
          </button>
          {filterOpen && (
            <>
              <div className="menu-scrim" onClick={() => setFilterOpen(false)} />
              <div className="theme-pop fade-enter" style={{ top: 36, right: 0 }}>
                <button
                  onClick={() => {
                    setFocusThemeId(null);
                    setFilterOpen(false);
                  }}
                >
                  <span className="tp-dot" /> All themes
                  {focusThemeId === null && (
                    <Icon name="check" size={14} style={{ marginLeft: 'auto', color: 'var(--accent)' }} />
                  )}
                </button>
                {themes.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setFocusThemeId(t.id);
                      setFilterOpen(false);
                    }}
                  >
                    <span className="tp-dot" /> {t.name}
                    {focusThemeId === t.id && (
                      <Icon name="check" size={14} style={{ marginLeft: 'auto', color: 'var(--accent)' }} />
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
```

- [ ] **Step 5: Add the active-filter banner + filter the notes list**

Immediately inside `<div className="notes-scroll" ref={railRef}>`, before the `{draft && (...)}` block, add the banner:

```tsx
          {focusThemeId && (
            <div className="reader-filter-banner">
              <Icon name="filter" size={13} />
              <span>Focused: {themes.find((t) => t.id === focusThemeId)?.name ?? 'theme'}</span>
              <button
                className="btn btn-quiet btn-sm"
                style={{ marginLeft: 'auto' }}
                onClick={() => setFocusThemeId(null)}
              >
                Clear
              </button>
            </div>
          )}
```

Then change the saved-notes map to filter by focus. Replace `{annotations.map((a) => {` with:

```tsx
          {annotations
            .filter((a) => matchesThemeFocus(a.id, focusThemeId, tagsByAnnotation))
            .map((a) => {
```

(The empty-state line `{annotations.length === 0 && !draft && (...)}` stays unchanged.)

- [ ] **Step 6: Verify build + lint**

Run: `npx tsc --noEmit` and `npx eslint src/components/AnnotationReader.tsx`
Expected: no new errors.

- [ ] **Step 7: Manual check**

In a paper with ≥2 themes and several notes, click the rail filter → pick a theme. Expected: only that theme's highlights stay fully visible (others dim), the rail shows only matching notes, a "Focused: …" banner appears; "All themes" / "Clear" restores everything; a highlight with two themes appears under both.

- [ ] **Step 8: Commit**

```bash
git add src/components/AnnotationReader.tsx src/app/styles/screens.css
git commit -m "feat(reader): theme focus filter with dimming (replaces multi-color highlights)"
```

---

### Task 6: `firstOccurrenceFlags` pure helper (TDD)

Used to anchor only the **first** rendered `<mark>` of each annotation (annotations can split across paragraphs).

**Files:**
- Modify: `src/lib/annotate/highlights.ts` (append the helper)
- Test: `tests/unit/first-occurrence.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/first-occurrence.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { firstOccurrenceFlags } from '@/lib/annotate/highlights';

describe('firstOccurrenceFlags', () => {
  it('flags only the first appearance of each id, ignoring nulls', () => {
    const input = [null, 'a', 'a', null, 'b', 'a'];
    expect(firstOccurrenceFlags(input)).toEqual([false, true, false, false, true, false]);
  });
  it('returns all false for an empty or all-null list', () => {
    expect(firstOccurrenceFlags([])).toEqual([]);
    expect(firstOccurrenceFlags([null, null])).toEqual([false, false]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/first-occurrence.test.ts`
Expected: FAIL — `firstOccurrenceFlags` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/annotate/highlights.ts`:

```ts
// Given the ordered sequence of annotation ids rendered across the document (null for
// plain-text parts), returns a parallel boolean[] flagging the FIRST appearance of each
// id. Used to give exactly one stable anchor (#hl-<id>) per annotation, even when its
// highlight is split across paragraphs.
export function firstOccurrenceFlags(annIds: (string | null)[]): boolean[] {
  const seen = new Set<string>();
  return annIds.map((id) => {
    if (id == null || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/first-occurrence.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/annotate/highlights.ts tests/unit/first-occurrence.test.ts
git commit -m "feat(reader): add firstOccurrenceFlags anchor helper"
```

---

### Task 7: Deep-link anchors + `?ann=` scroll-and-flash (BUG-9, reader side)

**Files:**
- Modify: `src/components/AnnotationReader.tsx`
- Modify: `src/app/styles/screens.css`

- [ ] **Step 1: Add the flash CSS**

Append to `src/app/styles/screens.css`:

```css
/* Deep-link flash — pulse a ring around a highlight when navigated to via ?ann= */
@keyframes hl-flash {
  0%,
  100% {
    box-shadow: 0 0 0 0 transparent;
  }
  25% {
    box-shadow: 0 0 0 3px var(--accent);
  }
}
.hl.hl-flash {
  animation: hl-flash 1.2s ease-out;
  border-radius: 2px;
}
```

- [ ] **Step 2: Import the anchor helper**

Add to the existing `@/lib/annotate/highlights` import in `AnnotationReader.tsx` so it reads:

```tsx
import { sliceSegment, firstOccurrenceFlags } from '@/lib/annotate/highlights';
```

- [ ] **Step 3: Precompute per-segment parts and anchor positions**

Replace the existing `hlAnns` memo and add the anchor memo just below it:

```tsx
  const hlAnns = useMemo<HlAnnotation[]>(
    () => annotations.map((a) => ({ id: a.id, charStart: a.charStart, charEnd: a.charEnd })),
    [annotations],
  );

  // Parts per segment (computed once) + the set of "<si>:<pi>" positions that should
  // carry the #hl-<annId> anchor (the first rendered mark of each annotation).
  const segParts = useMemo(
    () => segments.map((seg) => sliceSegment({ offset: seg.offset, text: seg.text }, hlAnns)),
    [segments, hlAnns],
  );
  const anchoredPositions = useMemo(() => {
    const flat = segParts.flatMap((parts) => parts.map((p) => p.annId ?? null));
    const flags = firstOccurrenceFlags(flat);
    const set = new Set<string>();
    let k = 0;
    segParts.forEach((parts, si) => {
      parts.forEach((_p, pi) => {
        if (flags[k]) set.add(`${si}:${pi}`);
        k += 1;
      });
    });
    return set;
  }, [segParts]);
```

- [ ] **Step 4: Render paragraphs from `segParts` with anchors**

Replace the `renderParagraph` function so it takes the segment index and reads precomputed parts, anchoring first occurrences:

```tsx
  function renderParagraph(si: number) {
    const parts = segParts[si];
    return parts.map((part, pi) => {
      if (!part.annId) return part.text;
      const isActive = activeId === part.annId;
      const dim = isDimmed(part.annId, focusThemeId, tagsByAnnotation);
      const anchored = anchoredPositions.has(`${si}:${pi}`);
      return (
        <mark
          key={pi}
          id={anchored ? `hl-${part.annId}` : undefined}
          className={'hl' + (isActive ? ' active' : '') + (dim ? ' hl-dim' : '')}
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            activateMark(part.annId!);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              activateMark(part.annId!);
            }
          }}
          aria-label="Highlighted annotation"
        >
          {part.text}
        </mark>
      );
    });
  }
```

Update the body render to call it by index. Replace the `segments.map(...)` block:

```tsx
              segments.map((seg, i) => (
                <p key={seg.offset} data-base={seg.offset} className={i === 0 ? 'dropcap' : ''}>
                  {renderParagraph(i)}
                </p>
              ))
```

- [ ] **Step 5: Make activation scroll the document too**

Replace `activateMark` so it also scrolls the document to the highlight (bidirectional nav — clicking a note jumps to the passage):

```tsx
  function activateMark(annId: string) {
    setActiveId(annId);
    if (activateTimerRef.current != null) clearTimeout(activateTimerRef.current);
    activateTimerRef.current = setTimeout(() => {
      document.getElementById('note-' + annId)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      document.getElementById('hl-' + annId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 30);
  }
```

Change the saved-note card's `onClick` from `() => setActiveId(a.id)` to `() => activateMark(a.id)` (and the same in its `onKeyDown` Enter/Space handler), so clicking a note scrolls to its passage.

- [ ] **Step 6: Add the `?ann=` deep-link effect**

Add this effect near the other `useEffect`s. It reads the query param on the client (avoids a Suspense boundary), scrolls, and flashes:

```tsx
  // Deep-link: ?ann=<id> scrolls to and flashes the highlight, and activates its note.
  useEffect(() => {
    const annId = new URLSearchParams(window.location.search).get('ann');
    if (!annId || !annotations.some((a) => a.id === annId)) return;
    setActiveId(annId);
    const el = document.getElementById('hl-' + annId);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('hl-flash');
    const t = setTimeout(() => el.classList.remove('hl-flash'), 1200);
    return () => clearTimeout(t);
  }, [annotations]);
```

- [ ] **Step 7: Verify build + lint**

Run: `npx tsc --noEmit` and `npx eslint src/components/AnnotationReader.tsx`
Expected: no new errors. (If `renderParagraph` had an unused `segOffset`/`segText` param reference elsewhere, ensure all call sites use the new `renderParagraph(i)` signature.)

- [ ] **Step 8: Manual check**

Open `…/papers/<pid>?ann=<annId>` for a real annotation id. Expected: page scrolls to that highlight, it pulses briefly, and its note card is active. Clicking a note card scrolls the document to its highlight.

- [ ] **Step 9: Commit**

```bash
git add src/components/AnnotationReader.tsx src/app/styles/screens.css
git commit -m "feat(reader): deep-link to a highlight via ?ann= with scroll-and-flash (BUG-9)"
```

---

### Task 8: Matrix cells link to the exact note (BUG-9 producer)

**Files:**
- Modify: `src/components/MatrixGrid.tsx`

- [ ] **Step 1: Append `?ann=<id>` to the cell-note link**

In `MatrixGrid.tsx`, the per-note link currently points at the paper without an anchor. Change it to include the annotation id (`n.id`):

```tsx
                          <div className="cn-p">
                            <Icon name="link" size={11} />
                            <Link href={`/workspaces/${workspaceId}/papers/${p.id}?ann=${n.id}`}>
                              {n.page != null ? `p.${n.page}` : 'view'}
                            </Link>
                          </div>
```

(Leave the empty-cell "+" link as `/workspaces/${workspaceId}/papers/${p.id}` — it targets no specific note.)

- [ ] **Step 2: Verify build + lint**

Run: `npx tsc --noEmit` and `npx eslint src/components/MatrixGrid.tsx`
Expected: no new errors.

- [ ] **Step 3: Manual check**

Open a collection matrix with notes, click a cell-note's page link. Expected: it opens the paper and lands on that exact highlight (scroll + flash from Task 7).

- [ ] **Step 4: Commit**

```bash
git add src/components/MatrixGrid.tsx
git commit -m "feat(matrix): link cell notes to the exact highlight via ?ann="
```

---

### Task 9: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit + integration suite**

Run: `npx vitest run`
Expected: all green, including the 3 new unit specs (`theme-name`, `theme-filter`, `first-occurrence`). No previously-passing test regresses.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: only the pre-existing `tests/ui/*` "Cannot find name 'it'/'expect'" errors (23 baseline) — zero new errors in `src/`.

- [ ] **Step 3: Lint the changed files**

Run: `npx eslint src/components/AnnotationReader.tsx src/components/MatrixGrid.tsx src/lib/themes/name.ts src/lib/annotate/themeFilter.ts src/lib/annotate/highlights.ts`
Expected: 0 errors (the `Deps`-style `any` warnings, if any, match existing convention).

- [ ] **Step 4: Production build smoke test**

Run: `npx next build`
Expected: build succeeds.

- [ ] **Step 5: Update the backlog statuses**

In `docs/BACKLOG.md`, mark BUG-4 (removed), BUG-5 (done), the theme-focus filter (replaces FEAT-2), and BUG-9 reader side as done; note the chat-side `?at=` deep-link remains in Phase 3. Commit:

```bash
git add docs/BACKLOG.md
git commit -m "docs: mark Phase 2 reader items done in backlog"
```

---

## Self-Review

**Spec coverage:**
- Remove settings gear → Task 1 ✓
- Create theme while highlighting (+ collectionId plumb, auto-select, null-collection hint) → Task 3 (helper in Task 2) ✓
- Theme focus filter (dim non-matching, filter rail, banner, multi-theme) → Task 5 (helper in Task 4) ✓
- Deep-link `?ann=` (stable anchor on first mark, scroll+flash on load, note→doc nav, matrix producers) → Tasks 6–8 ✓
- No schema changes → confirmed (no migration tasks) ✓
- Testing via extracted pure helpers → Tasks 2, 4, 6 are TDD unit tests ✓

**Placeholder scan:** No TBD/TODO; every code step shows the actual code; manual-check steps state exact expected behavior.

**Type consistency:** `Theme` = `{ id: string; name: string }` used consistently; `createThemeInline(name): Promise<Theme | null>` matches `ThemePop`'s `onCreate` contract; `firstOccurrenceFlags(annIds: (string|null)[]): boolean[]` matches its consumer in Task 7; `matchesThemeFocus`/`isDimmed(annId, focusThemeId, tags)` signatures match call sites in Task 5 and Task 7; `renderParagraph(i: number)` updated at its single call site.
