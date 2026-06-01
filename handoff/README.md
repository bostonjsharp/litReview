# Handoff: LitReview — Full UI Implementation

## Overview
**LitReview** is a private web app where a research team stores academic papers and the literature reviews about them, reads and annotates papers, builds a synthesis "literature matrix," and asks an AI chat questions answered only from their own corpus — with citations linking back to the exact source passage.

This package documents the **complete UI**: 10 screens covering the full flow from sign-in through the annotation/synthesis/chat experience, in a single connected prototype. It is everything needed to recreate the interface in a production codebase.

**Users:** University researchers (professors + fellows) collaborating in shared private workspaces.

**Visual tone:** Calm, academic, text-forward, highly readable — a research/reading tool in the spirit of Readwise / Notion / a reference manager. Generous whitespace, strong long-form typography, restrained color, accessible contrast. Light mode primary, dark mode fully supported.

---

## About the Design Files
The files in this bundle (`source/*.html`, `*.css`, `*.jsx`, `data.js`) are **design references created in HTML + a thin React/Babel layer**. They are prototypes showing the intended look and behavior — **not production code to copy directly**.

Your task is to **recreate these designs in the target codebase's environment** using its established patterns and libraries. The existing codebase is **Next.js (App Router) + Drizzle ORM + Postgres** (a `litReview` repo already exists with the API routes and schema). Implement the UI as React Server/Client Components against that stack — do **not** ship the prototype's Babel-in-browser setup.

The prototype uses inline mock data (`data.js`) and a hand-rolled hash-free router (`app.jsx`). In production, replace these with real routing (Next App Router) and the existing API endpoints (see **Data & Wiring**).

---

## Fidelity
**High-fidelity (hifi).** Final colors, typography, spacing, radii, shadows, and interactions are all specified here and in the CSS. Recreate the UI pixel-faithfully using the codebase's component library/conventions, pulling exact token values from the **Design Tokens** section (or copy `styles.css` wholesale as a starting token layer — it is framework-agnostic CSS custom properties).

---

## Design Tokens

All tokens live as CSS custom properties in `source/styles.css` under `:root`/`[data-theme="light"]` and `[data-theme="dark"]`. Dark mode is driven entirely by the `data-theme` attribute on `<html>`. **The fastest correct path is to copy `styles.css` and `layout.css`/`screens.css` directly** and theme via `data-theme`. Key values:

### Color — Light (default)
| Token | Value | Use |
|---|---|---|
| `--bg` | `#f1f4ef` | App background (warm sage off-white) |
| `--surface` | `#ffffff` | Cards, panels, bars |
| `--surface-2` | `#f8faf6` | Insets, search field, dropzone |
| `--surface-3` | `#eef2ec` | Hover fills, segmented control track |
| `--ink` | `#1b2520` | Primary text |
| `--ink-2` | `#45524b` | Secondary text |
| `--muted` | `#76817a` | Meta text |
| `--faint` | `#9aa39c` | Placeholders, disabled |
| `--border` | `#e2e7df` | Hairlines |
| `--border-strong` | `#d2d9cf` | Input borders, dashed zones |
| `--accent` | `oklch(0.47 0.072 162)` | Primary green (buttons, links, active) |
| `--accent-hover` | `oklch(0.42 0.075 162)` | |
| `--accent-ink` | `#fbfdfb` | Text on accent |
| `--accent-soft` | `oklch(0.955 0.022 162)` | Chip/badge fills, soft accent bg |
| `--accent-soft-border` | `oklch(0.9 0.03 162)` | |
| `--accent-faint` | `oklch(0.975 0.012 162)` | Active rows, note compose bg |
| `--highlight` | `oklch(0.93 0.085 92)` | Annotation highlight (amber) on text |
| `--highlight-strong` | `oklch(0.86 0.12 88)` | Highlight hover, quote left-border |
| `--highlight-ink` | `#4a3a13` | Text selection foreground |
| `--warn` / `--warn-soft` | `oklch(0.74 0.11 70)` / `oklch(0.95 0.04 75)` | "Processing" status |
| `--danger` / `--danger-soft` | `oklch(0.56 0.14 28)` / `oklch(0.95 0.03 28)` | "Failed", remove member |

### Color — Dark (`[data-theme="dark"]`)
`--bg #11150f` · `--surface #181d15` · `--surface-2 #1d231a` · `--surface-3 #232a1f` · `--ink #ecf0e7` · `--ink-2 #bcc6ba` · `--muted #8a948a` · `--faint #6a746a` · `--border #2a3127` · `--border-strong #3a4335` · `--accent oklch(0.74 0.1 162)` · `--accent-ink #0e120c` · `--highlight oklch(0.55 0.085 90)`. Full set in `styles.css`.

### Typography
- **Serif — Spectral** (`--serif`): headings, paper titles, reading body, annotation quotes, the "literary" voice. Weights 400/500/600/700 + italic.
- **Sans — Hanken Grotesk** (`--sans`): all UI chrome — buttons, labels, nav, inputs, body default. Weights 400/500/600/700.
- **Mono — IBM Plex Mono** (`--mono`): metadata — DOIs, page refs, invite codes, eyebrows, status badges, stat labels, timestamps. Weights 400/500/600.
- Base body: 15px / line-height 1.5 / letter-spacing −0.005em. Headings: −0.01em tracking, line-height 1.15.
- Google Fonts load with `display=block` (prevents serif reflow). Render is gated on `document.fonts.ready` in the prototype; in Next, use `next/font` to self-host all three and avoid FOUT.

### Spacing scale (8px base)
`--s1 4` · `--s2 8` · `--s3 12` · `--s4 16` · `--s5 24` · `--s6 32` · `--s7 48` · `--s8 64` · `--s9 96` (px).

### Radius
`--r-sm 5` · `--r 8` · `--r-lg 12` · `--r-xl 18` · `--r-pill 999` (px).

### Shadows
- `--shadow-sm`: `0 1px 2px rgba(27,37,32,.05), 0 1px 1px rgba(27,37,32,.03)`
- `--shadow`: `0 6px 24px -8px rgba(27,37,32,.14), 0 2px 6px -2px rgba(27,37,32,.06)`
- `--shadow-lg`: `0 24px 60px -18px rgba(27,37,32,.26)`
- `--ring` (focus): `0 0 0 3px oklch(0.47 0.072 162 / .18)`

### Motion
- Standard ease: `cubic-bezier(.2,.7,.2,1)` (`--ease`).
- Entrance: `.fade-enter` = 7px rise over .4s (no opacity fade — intentional, keeps content visible if animation pauses).
- Hover transitions 140–180ms. Theme transitions on **surfaces only** (`.themed` = background/color/border .25–.35s); the `<body>` background switches instantly (transitioning it caused mid-swap flashes — do not animate it).
- Slide-in panel (`suggest-panel`): `translateX(100%)→0` .3s.

---

## Core Objects (vocabulary)
`Workspace → Collections (research questions) → Papers & Reviews`; **Annotations** (highlight + comment on a paper); **Themes** (tags on annotations); **Chat** (AI Q&A over the workspace). A workspace is the shared private container; all members read and write equally.

Mock shapes are in `source/data.js` (`window.LR`) — use it as the canonical field list for each entity (paper: `id, status, title, authors[], year, journal, doi, pages, annCount, themes[]`; collection: `id, name, question, paperIds[], reviewIds[], color`; annotation: `id, para, quote, comment, themes[], author, page`; member: `id, name, email, role, color, you`; workspace: `id, name, role, memberCount, collectionCount, paperCount, invite`).

---

## Global Chrome

Two layout modes, chosen by route:

1. **Immersive** (no chrome): `signin`, `onboarding`, `home`, `reader`, `composer` — full-viewport.
2. **App shell** (everything else): CSS grid `256px 1fr`.
   - **Left sidebar** (`.sidebar`, 256px, `--surface`, right hairline): brand lockup (30px `LR` accent tile + "LitReview" in Spectral 19px) → primary **Add paper** button → nav (Collections / Literature matrix / Chat / Members, 38px rows, active = `--accent-soft` fill + accent text) → "Collections" list (colored dots + names).
   - **Top bar** (`.topbar`, 64px, `--surface`, bottom hairline): **workspace switcher** (left) · **search field** (center, max 460px, ⌘K hint) · **theme toggle** (sun/moon) + **account avatar** (right).
   - **Workspace switcher** opens a 260px menu: list of workspaces (active checkmarked) + "Create or join", "All workspaces", "Sign out".

Icons are a single inline-SVG set (24-viewbox, 1.7 stroke, round caps/joins) defined in `source/ui.jsx` `ICONS`. Use any equivalent icon library (Lucide matches the style closely). The Google "G" is a 4-color exception.

---

## Screens / Views

> Layout specifics, exact copy, and every class are in the bundled `*.jsx` + `*.css`. Below is the implementation-level summary.

### 1. Sign in  — `source/auth.jsx` → `SignIn`  *(the screen the client most wants improved)*
Two directions; ship **one** (a floating toggle in the prototype lets you compare — remove it in prod).
- **Variant A "Editorial split"** (`SignInSplit`, default): grid `1.05fr 1fr`. **Left aside** (`--surface`, faint radial accent wash + horizontal rule stripes): brand lockup top, a large Spectral pull-quote mid ("A shared desk for the papers your lab *actually* reads." — the word *actually* in accent italic), and 3 feature rows bottom (icon tile + title + one-line description). **Right panel**: centered 380px card — "Sign in" (Spectral 30px), lede, full-width **Continue with Google** button (52px, white, bordered, Google glyph), an "Institutional access" divider, a secondary **university SSO** button, fine print.
- **Variant B "Reading card"** (`SignInCentered`): single centered 440px card (radius `--r-xl`, `--shadow-lg`) on a page-stripe background masked with a radial fade. 52px `LR` mark, "Welcome to LitReview", lede, Google button, then a bordered 3-feature list. Calmer, more focused.
- **Features (both):** Read & annotate · Synthesize in a matrix · Ask your corpus.
- **Behavior:** Google button → navigate to **Home**. Sign-in is Google OAuth (the repo has the auth route).

### 2. Onboarding — `auth.jsx` → `Onboarding`
Centered, max 880px. Eyebrow "Step 1 of 1 · Set up" → "Find your workspace" (38px) → one-line explainer. Two side-by-side cards (grid `1fr 1fr`):
- **Create a workspace** (primary, accent-tinted border): plus icon tile, name field, large primary **Create workspace** button (disabled until name entered).
- **Join a workspace**: users icon, **invite code** field (mono, uppercase, letter-spaced, placeholder `7F3K-92QD`), ghost **Join workspace** button (disabled until filled).
- Footer: "You can belong to several workspaces and switch between them anytime."
- A user with **no workspace** lands here after sign-in. Both actions → Dashboard.

### 3. Home / workspace switcher — `auth.jsx` → `Home`
Own top bar (brand + theme toggle + Sign out). Centered 760px column. Greeting block (eyebrow "Signed in as elena.hart@univ.edu", "Good morning, Elena.", "Choose a workspace to continue."). **Workspace list**: card rows (hover-lift) — 46px `LR` mark, name (Spectral 18px), stat row (`N collections · N papers · N members` in mono), role tag (owner/member pill), chevron. Below: two dashed "Create a workspace" / "Join with a code" cards. Rows → Dashboard (sets active workspace).

### 4. Workspace dashboard — `source/workspace.jsx` → `Dashboard`
App shell. Page head (eyebrow = workspace name, "Collections", sub-explainer) with **Members** + **Add paper** actions. **Stat row**: collections / papers / annotations / themes (Spectral 28px numbers, mono labels) + a right-aligned "Ask the corpus" quiet button. **Collection grid** (`auto-fill, minmax(330px,1fr)`): each card = colored dot + uppercase mono name, the research **question** (Spectral 18.5px, the visual hero of the card), footer with `N papers · N reviews`. Plus a dashed **New collection** card. Cards → Collection detail.

### 5. Collection detail — `workspace.jsx` → `Collection`
"All collections" back link → **hero panel**: colored dot + name, "Research question" eyebrow, the question in Spectral 25px, action row (Add paper / Open matrix / Ask about this). Then **Papers** list (card with rows) and, if present, **Reviews** list. Each paper row: 38×50 "PDF" placeholder thumb, Spectral title, `authors · year · journal` meta, annotation count pill (note icon + N), page count **or** a status badge, and a Retry button when failed. Ready rows are clickable → Reader. Review rows → Composer.

### 6. Members & invite — `workspace.jsx` → `Members`
Page head + **invite card**: left = "Invite link" + explainer; right = a mono link box `litreview.app/join/<CODE>` (the code in accent) with a **Copy** button (flips to "Copied ✓" for 1.6s), and an owner-only **Regenerate link** quiet button. **People list**: avatar (initials, per-member color), name (with "(you)"), email (mono), role tag. Owner sees a **Remove** danger button on non-owner members. All members read/write equally; only owner manages membership.

### 7. Upload / import — `workspace.jsx` → `Upload`
Max 720px. Page head (eyebrow `<workspace> · import`). Control row: **segmented Paper / Review** toggle + a **Collection** `<select>`. Large **dropzone** (dashed, hover → accent tint): upload icon tile, "Drop a PDF here", browse link, "Paste text instead" button. A wiring note line shows the active workspace id (mono). **Recent imports** queue: each item = file icon, mono filename, a progress bar when *processing*, a **status badge** (ready / processing / pending / failed), and a **Retry** on failed (with an error explainer line). Status lifecycle: `pending → processing → ready | failed`.

### 8. Paper reader — `source/reader.jsx` → `Reader`  *(THE HERO SCREEN — give it the most attention)*
Grid `1fr 380px`: reading column + notes rail.
- **Reading column** (`.reader-main`, scrolls): sticky translucent blurred top bar (back link to collection, note count, settings). Doc block max 660px: mono eyebrow (`journal · year · pages`), Spectral **title 33px**, byline, mono DOI, then body paragraphs in **Spectral 18.5px / line-height 1.72** — long-form reading typography is the point.
- **Highlights:** annotated phrases are wrapped in `<mark class="hl">` (amber `--highlight`, subtle underline shadow); hover/active deepen to `--highlight-strong`. Clicking a highlight activates its note in the rail.
- **Selection → note:** on text selection (≥4 chars), a dark **floating popover** ("Highlight & note") appears above the selection. Clicking it opens a **compose card** at the top of the rail: the quoted passage, a comment textarea (autofocused), a theme-chip picker (+ theme opens a popover of the collection's themes), Save / Cancel. Save prepends the new note.
- **Notes rail** (`.notes-rail`, 380px, `--surface`, own scroll): header (count + filter). Each **note card**: italic Spectral quote (left amber border), comment, **theme chips** (each removable; a "+ tag" chip opens the theme popover to add/remove), footer with author avatar + `author · p.N`. Active note = accent-faint bg.
- This is the screen to nail: real text selection, the popover position math, highlight↔note linking, and theme tagging are all implemented in `reader.jsx` — mirror that behavior.

### 9. Review composer — `reader.jsx` → `Composer`
Grid `1fr 300px`. **Main**: sticky bar (back, "Saved" badge, Read view, Publish). Doc max 720px: an inline-editable **title** (Spectral 34px), mono sub-meta (`collection · N blocks · author`). Body is an **ordered list of blocks**:
- **Prose block**: auto-growing Spectral textarea.
- **Annotation block**: a quote card (italic Spectral, amber left border, accent-faint bg) with mono source/page/theme meta.
- On block hover, a left **handle rail** appears: move up / drag / move down / delete.
- Below: "Prose block" / "Insert note" add buttons.
- **Right rail** (`.composer-rail`, 300px): "Your notes · drag to insert" — available annotation cards; clicking adds one as a block. Also a read view of the assembled review (Publish/Read view toggles).

### 10. Literature matrix — `source/synthesis.jsx` → `Matrix`
App shell, page head with **Suggest themes** primary action. A scrollable **table**: sticky header row (theme columns, each with name + `N papers` count) and sticky first column (paper rows: Spectral title + `lastname · year`). **Cells**: each holds that paper's notes for that theme — a small quote card (italic Spectral, amber left border) with a mono `🔗 p.N` link → Reader. Empty cells show a faint **+** on hover. **Suggest themes** opens a right **slide-in panel** (420px): AI-proposed themes, each with a rationale and an "N annotations match" count and an **Add** button (review-then-apply — Add inserts the theme as a new matrix column and marks it "Added").

### 11. Chat — `synthesis.jsx` → `Chat`
Centered 860px column. **Scope bar**: pills for "Whole workspace" / a collection / "Single paper" (active = accent). **Empty state**: chat-mark tile, "Ask your corpus", explainer, and 3 suggested-question buttons. **Conversation**: user questions as right-aligned accent bubbles; answers as a Spectral 17px block where inline citation markers render as **accent superscript pills** (`[1]`→¹), followed by a **Sources** list — each cite card = number badge, `type · paper · p.N`, the italic quoted passage, and a chevron → Reader. **Composer**: bordered textarea + send (Enter to send, Shift+Enter newline); a mono hint shows scope ("41 papers in scope"). Answers are drawn only from the workspace corpus; every claim links to a source.

---

## Interactions & Behavior
- **Navigation:** prototype uses a `nav(route, params)` function (`source/app.jsx`) persisting route + params to `localStorage`. In Next, map each route to an App-Router segment; `params` (collection id, paper id, review id, ws id) become route params.
- **Theme:** toggle sets `data-theme` on `<html>`, persisted. Surfaces transition; body switches instantly. Provide both modes.
- **Sign-in variant:** prototype-only A/B toggle — pick one for production.
- **Workspace context:** the active `workspaceId` is global and **must thread through every content action** — upload, chat, collection creation, navigation. API routes require it and enforce membership.
- **Annotation flow:** select text → popover → compose (comment + themes) → save → appears in rail and as `<mark>` in text. Clicking a `<mark>` activates its rail note; theme chips add/remove via popover.
- **Status badges:** `ready` (accent) · `processing` (amber, with progress bar) · `pending` (grey) · `failed` (red, with Retry). Background processing for uploads.
- **Copy invite:** button → clipboard, shows "Copied ✓" 1.6s.
- **Matrix Suggest themes:** slide-in, per-item Add appends a column (review-then-apply).
- **Focus states:** inputs get `--accent` border + `--ring`. Maintain visible focus for accessibility.
- **Empty/loading/error states** are designed for: chat empty state, failed uploads/papers with Retry, processing with progress. Implement real equivalents.

---

## State Management
Per-screen local state in the prototype; in production wire to the existing API:
- **Global:** `activeWorkspaceId` (threads everywhere), `theme`, current user, route params.
- **Reader:** annotations list, active annotation id, current text selection, draft note (quote/comment/themes), theme-picker open target.
- **Composer:** ordered blocks (prose/annotation), available (unused) notes for the rail.
- **Matrix:** theme columns, added-suggestion set, suggest-panel open.
- **Chat:** scope, conversation turns, input; each answer carries its citations.
- **Upload:** import kind (paper/review), target collection, queue with per-item status/progress.

---

## Data & Wiring (existing backend)
API endpoints already exist and **require workspace context**: workspaces (create/list/join/members/invite-code), collections, upload, chat, annotations + theme tagging, the matrix, and theme suggestion. Routes such as `/api/upload`, `/api/chat`, `/api/collections` enforce membership and need the active `workspaceId`. The UI's job is to call them with workspace context — see the repo's `src/db/schema.ts` for the canonical data model and `src/app/api/*` for the routes. Replace `data.js` mock shapes with these.

---

## Assets
- **Fonts:** Spectral, Hanken Grotesk, IBM Plex Mono (Google Fonts → self-host via `next/font`).
- **Icons:** inline SVG set in `ui.jsx` (`ICONS`); swap for Lucide or keep the set. Google "G" is multi-color.
- **PDF/thumbnail placeholders:** diagonal-striped CSS placeholders (`.placeholder`) — real app shows PDF first-page renders or a generic doc tile.
- No raster image assets; everything is type, CSS, and SVG.

---

## Files (in this bundle, under `source/`)
- `LitReview.html` — entry; load order + Google Fonts link.
- `styles.css` — **design tokens** (light+dark), reset, primitives (buttons, inputs, chips, badges, cards, avatars, meta).
- `layout.css` — app shell, sidebar, top bar, menus, auth screens, onboarding, home, dashboard/collection.
- `screens.css` — members, upload, reader, composer, matrix, chat.
- `data.js` — `window.LR` mock corpus (canonical entity shapes + sample content).
- `ui.jsx` — Icon set, Avatar, Badge, Sidebar, Topbar, workspace menu, PageHead.
- `auth.jsx` — SignIn (both variants), Onboarding, Home.
- `workspace.jsx` — Dashboard, Collection, Members, Upload.
- `reader.jsx` — Reader (hero) + Composer.
- `synthesis.jsx` — Matrix + Chat.
- `app.jsx` — router, theme, mount (reference for routes + state, not for production).

Open `LitReview.html` in a browser to interact with the full flow. **Recommended approach:** lift `styles.css`/`layout.css`/`screens.css` as the token + style layer, then rebuild each screen as a Next component, replacing mock data and the prototype router with the real API and App Router.
