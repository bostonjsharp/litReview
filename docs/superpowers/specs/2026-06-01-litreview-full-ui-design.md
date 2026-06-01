# LitReview — Full UI Implementation (Design Spec)

**Date:** 2026-06-01
**Status:** Approved design → ready for implementation plan
**Source of truth for visuals:** `handoff/` (README + `source/*.css` + `source/*.jsx`)

## 1. Goal

Recreate the high-fidelity "Quiet Press" design from `handoff/` across all 11 screens of the
existing Next.js (App Router) + Drizzle + Postgres app, **wired to the real API/DB** (not mock
data). The prototype's Babel-in-browser setup and `data.js` mocks are reference only.

## 2. Approved decisions

1. **Scope:** Foundation (tokens/fonts/shell) + all screens.
2. **Sign-in:** Variant A — "Editorial split" only. Drop the prototype's A/B variant toggle.
3. **Wiring:** Fully wired to real API routes / server components / DB.
4. **Routing:** Nest all workspace content under `/workspaces/[id]/...` using `(app)` /
   `(immersive)` route groups (see §4). Confirmed.
5. **Icons:** Port the prototype's inline-SVG `ICONS` set into a local `<Icon>` component. No new
   dependency.
6. **Search & University SSO** (no backend today):
   - **Top-bar search** — *keep, build styled, wire later.* Feasible: the app already has vector +
     full-text retrieval (`src/lib/search/retrieve.ts`), so a search endpoint is a natural later
     add. Built now as a styled, non-submitting input.
   - **University SSO button** — *omit.* Not feasible without a specific institution's IdP
     config/credentials. The sign-in card ships Google OAuth only (its "Institutional access"
     divider + SSO button are removed).

## 3. Foundation layer

### 3.1 CSS tokens & primitives
- Copy `handoff/source/styles.css`, `layout.css`, `screens.css` into `src/app/styles/`
  (e.g. `tokens.css`, `layout.css`, `screens.css`) and import them from the root layout.
- Replace the current `src/app/globals.css` content (keep the file or drop it; the three copied
  files become the style layer). All styling stays **class-based**, matching the prototype.
- One adaptation: the prototype targets `#root`; our components render under `<body>`. The
  `height:100%` chain (`html, body { height:100% }`) already exists in `styles.css`; ensure the
  app-shell/immersive wrappers fill height.

### 3.2 Fonts (`next/font/google`)
- Load **Spectral** (400/500/600/700 + italic), **Hanken Grotesk** (400/500/600/700), **IBM Plex
  Mono** (400/500/600) via `next/font/google` in the root layout, each exposing a CSS variable.
- Wire those variables into the token names so `styles.css` keeps working:
  `--serif: var(--font-spectral)`, `--sans: var(--font-hanken)`, `--mono: var(--font-plex-mono)`.
  Set on `<html>`/`<body>` via the font `variable` className. Removes Geist + the prototype
  `<link>` font loading. Eliminates FOUT (self-hosted).

### 3.3 Theme (light/dark)
- `data-theme="light|dark"` on `<html>`, persisted to `localStorage` key `lr-theme`.
- A blocking inline `<script>` in the root layout `<head>` reads `localStorage`/`prefers-color-scheme`
  and sets `data-theme` before paint (no flash).
- `ThemeToggle` client component (sun/moon `<Icon>`) flips the attribute + persists. Used in the
  top bar and on the Home/Sign-in screens.
- Honor the prototype rule: surfaces transition (`.themed`), `<body>` background switches instantly.

### 3.4 Icons
- `src/components/ui/Icon.tsx` — port the `ICONS` path map + `<Icon name size stroke>` from
  `handoff/source/ui.jsx`, including the 4-color Google "G" special case. 24 viewBox, 1.7 stroke,
  round caps/joins. Path string split on `"M"` exactly as the prototype.

### 3.5 Shared chrome components (`src/components/ui/`)
Ported from `ui.jsx`, but data comes from props (no `window.LR`):
- `Avatar({ name, color, size })` — initials helper (port `LR.initials`).
- `StatusBadge({ status })` — ready/processing/pending/failed.
- `PageHead({ eyebrow, title, sub, children })`.
- `Sidebar` — brand → "Add paper" → nav (Collections/Literature matrix/Chat/Members) → collections
  list. Receives `workspaceId`, `collections`, and active route; links are real `next/link` hrefs.
- `Topbar` — workspace switcher (real workspace list + role + member count), styled search input,
  `ThemeToggle`, account avatar (→ Home). `WorkspaceMenu` lists workspaces (active checkmarked) +
  "Create or join" (→ /onboarding), "All workspaces" (→ /), "Sign out" (next-auth `signOut`).

## 4. Routing & workspace threading

Move flat content routes (`/upload`, `/chat`, `/papers`, `/reviews`, `/collections`) under the
workspace so `workspaceId` is always a route param (the API requires it for upload/chat/collections).

```
src/app/
  layout.tsx                                   root: fonts, theme script, style imports
  login/page.tsx                               Sign-in (Variant A, immersive)
  onboarding/page.tsx                          Onboarding (immersive)
  join/[code]/page.tsx                         (unchanged logic; light restyle of error state)
  page.tsx                                     Home / workspace picker (own top bar)
  workspaces/[id]/
    (app)/layout.tsx                           App shell — fetches workspace, role, collections
    (app)/page.tsx                             Dashboard
    (app)/collections/[cid]/page.tsx           Collection detail            ⟵ NEW
    (app)/collections/[cid]/matrix/page.tsx    Matrix
    (app)/members/page.tsx                     Members & invite
    (app)/upload/page.tsx                      Upload / import
    (app)/chat/page.tsx                        Chat
    (immersive)/papers/[pid]/page.tsx          Reader (hero)   — no shell
    (immersive)/reviews/[rid]/edit/page.tsx    Composer        — no shell
```

- `(app)` and `(immersive)` are route groups (no URL segment). `(app)/layout.tsx` renders the
  `app-shell` grid (Sidebar + Topbar + scroll region). `(immersive)/layout.tsx` is a minimal
  full-viewport wrapper.
- The `(app)` layout does the membership check (`requireUser` + `getMembership`) once and 404/redirects
  if the user isn't a member; passes workspace + role + collections to chrome.
- **Link updates:** every internal `href` that pointed at a flat route is rewritten to the nested
  form (e.g. paper links → `/workspaces/${wsId}/papers/${id}`). Old flat route folders are removed.
- Existing API routes under `src/app/api/**` are **unchanged**.

## 5. Per-screen specification

For each: file(s), data source, and behavior. Class names come from the copied CSS; markup mirrors
the prototype JSX.

### 5.1 Sign-in — `login/page.tsx` (Variant A)
- Layout: `.auth-split` (`1.05fr 1fr`). Left `.auth-aside` (radial wash + stripe overlay): brand
  lockup, Spectral pull-quote ("A shared desk for the papers your lab *actually* reads." — *actually*
  in accent italic), 3 feature rows (Read & annotate · Synthesize in a matrix · Ask your corpus).
  Right `.auth-panel`: 380px card — "Sign in", lede, `.btn-google` Continue-with-Google, fine print.
- **No** institutional-access divider/SSO button (see §2.6).
- Behavior: Google button is a server action `signIn('google', { redirectTo: '/' })`. Theme toggle
  available (top-right or omitted on this screen — minor).

### 5.2 Onboarding — `onboarding/page.tsx` + `WorkspaceOnboarding`
- `.onb-stage` / `.onb-wrap` (max 880). Eyebrow "Step 1 of 1 · Set up", "Find your workspace",
  explainer. `.onb-grid` two cards:
  - Create (primary, accent border): name field + primary button (disabled until name).
  - Join: mono invite-code field (uppercase, letter-spaced, placeholder `7F3K-92QD`) + ghost button
    (disabled until filled).
- Footer line. Both actions → `/workspaces/${id}` (create via `POST /api/workspaces`, join via
  `POST /api/workspaces/join`). Restyle existing `WorkspaceOnboarding` client component.

### 5.3 Home — `page.tsx`
- Own `.home-top` bar (brand + ThemeToggle + Sign out). `.home-wrap` (760). Greeting block
  (eyebrow "Signed in as <email>", "Good <time>, <name>.", "Choose a workspace to continue.").
- `.ws-list` card rows: 46px `LR` mark, Spectral name, mono stat row `N collections · N papers ·
  N members`, role pill, chevron. Two dashed add cards (Create → /onboarding, Join with a code →
  /onboarding).
- Data: `auth()` + `listWorkspaces(user.id)` + per-workspace counts (collections, papers, members)
  via aggregate db queries in the server component. Rows → `/workspaces/${id}`.

### 5.4 Dashboard — `workspaces/[id]/(app)/page.tsx`
- `PageHead` (eyebrow = workspace name, "Collections", sub) with Members + "Add paper" actions.
- `.stat-row`: collections / papers / annotations / themes (Spectral numbers, mono labels) +
  right-aligned "Ask the corpus" quiet button (→ chat).
- `.coll-grid` (`auto-fill, minmax(330px,1fr)`): each `.coll-card` = colored dot + uppercase mono
  name + research question (Spectral 18.5px hero) + footer `N papers · N reviews`. Dashed
  `.coll-new` card → create collection (`POST /api/collections`).
- Data: server component db queries (collections in workspace + counts). Collection card colors:
  derive deterministically from collection id (the schema has no color column) — a small palette
  mapped by index/hash. Cards → `/workspaces/${id}/collections/${cid}`.

### 5.5 Collection detail — `workspaces/[id]/(app)/collections/[cid]/page.tsx` **(NEW)**
- "All collections" back link → `.coll-hero` (dot + name, "Research question" eyebrow, question in
  Spectral 25px, action row: Add paper / Open matrix / Ask about this).
- `.list-card` Papers list: each `.paper-row` = 38×50 "PDF" `.placeholder` thumb, Spectral title,
  `authors · year · journal` meta, annotation-count pill (note icon + N), page count **or**
  `StatusBadge`, Retry button on `failed` (→ `POST /api/process`). Ready rows clickable → Reader.
- Reviews list (if any): rows → Composer (`/workspaces/${id}/reviews/${rid}/edit`).
- Data: server db queries — papers (+ per-paper annotation counts, page count from `pageOffsets`),
  reviews, themes count. New page; no new API needed.

### 5.6 Members & invite — `workspaces/[id]/(app)/members/page.tsx` + `MembersPanel`
- `PageHead` + `.invite-card`: left "Invite link" + explainer; right `.invite-link` mono box
  `litreview.app/join/<CODE>` (code in accent) + Copy button (flips "Copied ✓" 1.6s) + owner-only
  Regenerate quiet button (`POST /api/workspaces/[id]/invite-code`).
- `.member-row` list: Avatar (initials, per-member color derived from id), name (+ "(you)"), mono
  email, role tag. Owner sees `.btn-danger` Remove on non-owners
  (`DELETE /api/workspaces/[id]/members/[userId]`).
- Data: `listMembers` (already wired in `MembersPanel`) + current user + role to gate owner actions.
  Restyle existing `MembersPanel`.

### 5.7 Upload / import — `workspaces/[id]/(app)/upload/page.tsx` + `UploadForm`
- `.upload-wrap` (720). `PageHead` (eyebrow `<workspace> · import`). Control row: segmented
  Paper/Review `.seg` toggle + Collection `<select>`. `.dropzone` (dashed, hover accent) with upload
  icon tile, "Drop a PDF here", browse, "Paste text instead". Wiring note line shows active
  workspace id (mono).
- `.queue` Recent imports: file icon, mono filename, `.q-bar` progress when processing, `StatusBadge`,
  Retry on failed + error explainer.
- Data: `POST /api/upload` (FormData incl. `workspaceId` from route param + optional `collectionId`).
  Collections for the `<select>` come from the shell layout / a server fetch. **Status polling:**
  after upload, poll `GET /api/papers/[id]` (or a light status read) to advance
  pending→processing→ready|failed and animate the bar. Restyle/extend existing `UploadForm`.

### 5.8 Reader (HERO) — `papers/[pid]/page.tsx` + rebuilt `AnnotationReader`
Grid `.reader` (`1fr 380px`). **Preserve the existing offset logic**
(`splitIntoSegments`, `resolveSelection` in `src/lib/annotate/offsets.ts`) for selection→char range;
layer the prototype's UX on top.

- **Reading column** `.reader-main`: sticky blurred `.reader-topbar` (back link to collection, note
  count, settings). `.reader-doc` (660): mono eyebrow (`journal · year · pages`), `.reader-title`
  (Spectral 33px), byline, mono DOI, `.reader-body` paragraphs (Spectral 18.5px / lh 1.72).
- **Highlights:** wrap annotated ranges in `<mark class="hl">`. Real version uses char offsets
  (`charStart`/`charEnd`) against the segment base offsets — split each segment's text at any
  annotation ranges that fall within it (generalize the prototype's `renderPara`, which matched by
  quote string, to offset-based slicing). Clicking a `<mark>` sets `activeId` + scrolls its rail note.
- **Selection → note:** on `mouseup` with ≥4 chars, compute the range rect relative to the doc and
  show `.sel-pop` ("Highlight & note") above it. Clicking opens `.note-compose` at the top of the
  rail (quoted passage, autofocused comment textarea, theme-chip picker with `.theme-pop` popover,
  Save/Cancel). Save → `POST /api/annotations` (`paperId, charStart, charEnd, quote, comment`),
  prepend returned annotation, then tag selected themes via `POST /api/annotations/[id]/themes`.
- **Notes rail** `.notes-rail`: header (count + filter). `.note` cards: italic Spectral quote (amber
  left border), comment, removable theme `.chip`s + `+ tag` (theme popover add/remove via
  `POST`/`DELETE .../themes/[themeId]`), footer Avatar + `author · p.N`. Active note = accent-faint.
  Comment edits → `PATCH /api/annotations/[id]`. Delete → `DELETE /api/annotations/[id]`.
- Data (server page): paper, annotations (+ their theme tags), collection themes, page numbers
  (`annotation.page`). `themes` list for the picker = collection themes.

### 5.9 Composer — `reviews/[rid]/edit/page.tsx` + rebuilt `ReviewComposer`
Grid `.composer` (`1fr 300px`).
- **Main** `.composer-main`: sticky bar (back, "Saved" badge, Read view toggle, Publish). `.composer-doc`
  (720): inline-editable `.composer-title-in` (Spectral 34px), mono sub-meta (`collection · N blocks ·
  author`). Body = ordered `.block` list:
  - Prose block: auto-growing Spectral `<textarea>` (PATCH/save on blur via entries API).
  - Annotation block: `.ann-card` quote (italic, amber left border) + mono source/page/theme meta.
  - On hover, `.block-handle` rail: move up / drag (visual) / move down / delete.
  - `.block-add`: "Prose block" / "Insert note".
- **Right rail** `.composer-rail` (300): "Your notes · drag to insert" — available (unused)
  annotation cards; click adds as a block.
- Data: `GET /api/reviews/[id]/entries`; add prose/annotation (`POST`), move (`PATCH {direction}`),
  remove (`DELETE`). **Candidate notes** for the rail = annotations on papers in the review's
  collection minus those already used — fetched in the server page and passed in. Drag-to-reorder is
  represented by the up/down handle buttons (true DnD deferred; documented).

### 5.10 Matrix — `collections/[cid]/matrix/page.tsx` + rebuilt `MatrixGrid` + `SuggestThemesPanel`
- `PageHead` with "Suggest themes" primary action. Scrollable `.matrix` table: sticky header (theme
  columns + `N papers` count), sticky first column (paper rows: Spectral title + `lastname · year`).
  `.cell-note` quote cards (italic, amber left border) with mono `🔗 p.N` link → Reader. Empty cells
  show faint `+` on hover.
- "Suggest themes" → `.suggest-panel` slide-in (420): AI themes (`POST .../suggest-themes`), each
  with rationale + "N annotations match" + Add (review-then-apply: Add creates the theme via
  `POST .../themes` and applies assignments via `POST /api/annotations/[id]/themes`, then marks
  "Added" and inserts the column).
- Data: `getMatrix(cid)` (already used by the page). Reuse existing `SuggestThemesPanel` logic,
  restyled into the slide-in.

### 5.11 Chat — `workspaces/[id]/(app)/chat/page.tsx` + rebuilt `ChatPanel`
- `.chat` column (860). `.chat-scope` pills: "Whole workspace" / a collection / "Single paper"
  (active = accent) → sets `scope` in the request.
- Empty state `.chat-empty`: chat-mark tile, "Ask your corpus", explainer, 3 suggested-question
  buttons. Conversation: user `.msg-q` right-aligned accent bubbles; answers `.msg-a` Spectral 17px;
  inline `[n]` markers (if present in the answer) render as `.answer sup` accent superscript pills;
  followed by `.cites` Sources list (number badge, `type · paper · p.N`, italic quote, chevron →
  Reader).
- Composer `.chat-input`: textarea + send (Enter sends, Shift+Enter newline); mono hint shows scope
  ("N papers in scope").
- Data: `POST /api/chat` with `{ workspaceId (route param), query, scope }`. Citations come back as
  `{ parentType, parentId, title, page }`; render as Sources, and if the answer text contains `[n]`
  tokens, map them to superscripts (graceful if absent). Collection list for scope pills from the
  shell. "N papers in scope" from a count query.

## 6. Scope boundaries (deferred / decorative)

- **Top-bar search:** styled input, no submit/results yet (search endpoint is a later task).
- **University SSO:** omitted entirely (§2.6).
- **Composer drag-and-drop:** handle rail uses up/down buttons; pointer DnD deferred.
- **Collection colors / per-member avatar colors:** derived deterministically from ids (no color
  columns in schema).
- **"Reading settings" gear** in the reader: present, non-functional placeholder.

## 7. Risks / notes

- **Route move is the riskiest change.** All internal links and any hardcoded redirects must be
  updated to nested forms. Verify there are no remaining flat-route links after the move.
- **Reader highlight rendering** must move from quote-string matching (prototype) to char-offset
  slicing across segments to be correct with the real `charStart`/`charEnd` data and duplicate text.
- **Upload status** depends on background processing (`after()` in `/api/upload`); polling cadence
  should be gentle (e.g. 2–3s) and stop on ready/failed.
- No git repo present (`Is a git repository: false`), so this spec is written to disk but not
  committed.

## 8. Suggested build order

1. Foundation: fonts + theme + copy CSS + `<Icon>` + chrome primitives (Sidebar/Topbar/PageHead/
   Avatar/Badge) + `(app)`/`(immersive)` layouts and route move.
2. Immersive entry screens: Sign-in (A), Onboarding, Home.
3. App-shell screens: Dashboard, Collection detail (NEW), Members, Upload.
4. Hero: Reader (most attention), then Composer.
5. Synthesis: Matrix + Suggest panel, Chat.
6. Verification pass: theme toggle both modes, link integrity after route move, each screen against
   the prototype.
