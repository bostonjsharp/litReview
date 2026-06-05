# LitReview — Bug & Feature Backlog

Recorded 2026-06-03 from a working session. Each item has an ID, a status, and
(where known) a code-location hypothesis to start from. Hypotheses are based on a
codebase survey, not yet confirmed by reproduction.

Status legend: `new` · `investigating` · `in-progress` · `done` · `wontfix`

---

## Vision

LitReview is **one centralized place to store papers, their reviews, and their
notes** so they're easily digestible and reusable across different projects.

It must do both halves of "review":
- **Create new literature reviews** in-app (synthesize annotations across papers into
  a written review you can publish/export), and
- **Store existing ones** (upload reviews you already have).

Papers, annotations, and reviews should be reusable assets — capture once, apply to
many projects/collections — not locked to a single collection. This drives FEAT-3
(reusable paper library), the review model (BUG-11/FEAT-5), and the matrix as the
cross-paper synthesis surface.

---

## Bugs

### BUG-1 — Google login intermittently failed in the lab
- **Status:** code root cause fixed; environment verification pending (user)
- **Report:** During lab testing, Google login didn't work once. Need to confirm it isn't consistent.
- **Code root cause (FIXED):** `requireUser` did a non-atomic check-then-insert by email
  (`src/lib/session.ts`). On a brand-new user's first login, concurrent requests both
  pass the existence check then both INSERT → unique-violation on `users.email` → one
  request 500s. You're logged in but the first page errors → looks like "login didn't
  work," intermittently. Fixed by extracting an idempotent `ensureUser` (`src/lib/users.ts`,
  `onConflictDoNothing` + re-select); reproduced by a 6-way concurrency test
  (`tests/integration/ensure-user.test.ts`).
- **Environment check (please verify in the lab):**
  1. `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` are set in the lab/deploy environment (not just locally).
  2. `AUTH_SECRET` is set and **stable** across restarts (a rotating secret invalidates sessions mid-use).
  3. In Google Cloud Console → Credentials, the **Authorized redirect URI** includes the
     exact lab URL: `https://<lab-host>/api/auth/callback/google` (scheme + host must match).
  4. `AUTH_URL`/`NEXTAUTH_URL` (if set) matches the lab host.
  If login fails consistently in the lab, it's almost certainly #1 or #3, not the race.

### BUG-2 — Can't always add notes to a paper (works sometimes)
- **Status:** FIXED
- **Report:** Adding a note/annotation succeeds sometimes, fails others — possibly latency.
- **Root cause:** `createAnnotation` inserted the row then `await embedAnnotation()` (a
  synchronous OpenAI call), and the route returned HTTP 400 on any error. When the
  embedding was slow/failed, the note was already saved but the API reported failure →
  UI showed an error and didn't render it; it reappeared on refresh. Save and embed were
  coupled and non-atomic.
- **Fix:** embedding is now best-effort (`embedBestEffort` in `src/lib/annotate/service.ts`)
  — the note always persists and returns 201; a failed embed is logged and re-embeds on
  next edit. Test: "persists and returns the annotation even when embedding fails"
  (`tests/integration/annotation-service.test.ts`).
- **Follow-up (optional):** move the success-path embed to `after()` so the save is also
  instant under normal latency (not just failure-safe).

### BUG-3 — Highlight & note icon doesn't disappear when the highlight is gone
- **Status:** DONE (Phase 0)
- **Report:** When a highlighted section is removed, its icon/marker lingers.
- **Root cause:** The "Highlight & note" **selection popover** (`sel` state). `onMouseUp`
  returned early when the selection collapsed (clicking away) without clearing `sel`, so the
  popover lingered after the selection was gone.
- **Fix:** a `document` `selectionchange` listener in `AnnotationReader.tsx` clears `sel`
  whenever the selection empties/collapses — dismissing the popover wherever you click.

### BUG-4 — Settings gear inside the paper view does nothing
- **Status:** DONE (Phase 2 — removed)
- **Report:** The gear icon in the immersive paper reader has no handler.
- **Resolution:** Decided in brainstorming there is no essential reading setting worth shipping; the dead button was removed from the reader topbar rather than filled in.

### BUG-5 — Lit matrix: AI can suggest themes, but users can't create themes inline
- **Status:** DONE (Phase 2)
- **Report:** "Suggest themes" (AI) exists, but no UI to create a theme manually. Users should be able to create a theme at highlight time and select one.
- **Resolution:** `ThemePop` in `AnnotationReader.tsx` now has a "+ New theme" input that creates the theme (`POST /api/collections/[id]/themes`) and auto-selects it; `collectionId` is plumbed into the reader and `themes` is local state so created themes appear everywhere without reload. Helper `normalizeThemeName` (`src/lib/themes/name.ts`). Still open later: the same affordance in the matrix view.

### BUG-6 — RAG is too rigid (exact-keyword feel)
- **Status:** DONE (Phase 3b)
- **Report:** Chat agent should search the corpus more flexibly and synthesize helpful info, not just exact matches.
- **Resolution:** Each question is rewritten into a history-aware, expanded search query
  (`rewriteSearchQuery` in `src/lib/chat/rewrite.ts`, one `llm.complete()` call, falls back
  to the raw question) before retrieval; `answerQuestion` retrieves on the rewritten query
  but answers the user's original wording. Retrieval tuned: default `k` 8→12, hybrid keyword
  weight 0.1→0.05 (semantic leads). The answer prompt (`openai.ts`) now synthesizes/reasons
  across passages and refuses far less eagerly — still corpus-only and cited (no outside
  knowledge). Also delivered the history-aware retrieval 3a deferred. Spec/plan in
  `docs/superpowers/{specs,plans}/2026-06-04-phase3b-smarter-retrieval*`.

### BUG-7 — Chat grows the page downward; needs a fixed composer + chat sessions
- **Status:** DONE (Phase 3a)
- **Report:** Chat just extends the page. Composer should stay put (scroll the messages, not the page). Users should create new chats, see history, and resume past chats.
- **Resolution:** New `chats` + `chatMessages` tables (private per-user) and a sessions
  service (`src/lib/chat/sessions.ts`); `/api/chats` routes (create/list/get/delete) and
  `/api/chats/[id]/messages` (the stateless `/api/chat` was removed). `ChatPanel` is now a
  two-pane windowed layout (`ChatHistoryRail` + conversation pane) where only the message
  list scrolls and the composer is pinned; new-chat (lazy create), history, resume, delete.
  Bounded conversational memory (last ~8 messages) via `answerQuestion`'s new `history`.

### BUG-8 — No spacing between user message and chat response
- **Status:** DONE (Phase 3a)
- **Report:** User message and the response visually touch.
- **Resolution:** Added `.msg-q + .msg-a` / `.msg-a` margins in `screens.css` as part of the
  3a layout work.

### BUG-9 — Chat/annotations should deep-link to the exact spot in the paper
- **Status:** DONE (reader side Phase 2; chat side + `?at=` Phase 3c)
- **Report:** Citations and pulled annotations should navigate to where the passage/note actually is in the paper.
- **Resolution (Phase 2):** each annotation's first `<mark>` carries `id="hl-<annId>"`; `…/papers/<pid>?ann=<id>` scrolls to and flashes that highlight and activates its note; clicking a note card scrolls the document to its passage; matrix cell notes link with `?ann=<id>`. Helper `firstOccurrenceFlags` in `lib/annotate/highlights.ts`; flash CSS `.hl-flash`.
- **Resolution (Phase 3c):** passage location (`charStart`, `paperId`) now flows through `RetrievedChunk`→`Citation`; `?at=<charStart>` scrolls to and flashes the containing paragraph (`segmentOffsetForChar` in `offsets.ts`, `.para-flash` CSS); chat citations and search results build jump links via `passageHref` (`src/lib/ui/passage-link.ts`) — paper→`?at=`, note→`?ann=`, review→edit page.

### BUG-10 — No author "stamp" on annotations
- **Status:** DONE (Phase 0)
- **Report:** There should be a stamp showing who left an annotation.
- **Resolution:** The note cards already stamp the author (colored `Avatar` + name + page,
  `note-foot`). Added the missing in-context piece: each in-text highlight now carries a
  `title`/`aria-label` "Highlighted by &lt;author&gt;" (hover tooltip), so you can see who
  highlighted a passage while reading without opening the rail.

### BUG-11 — Define what a "review" is (RESOLVED)
- **Status:** resolved (decision made) → implementation tracked in FEAT-5 / FEAT-7
- **Decision:** A review is a first-class literature-review document. LitReview must
  **create new** reviews (compose from annotations across papers → publish/export) and
  **store existing** ones (upload). Reviews live alongside the papers/notes they draw
  from so they're easy to apply to other projects. The missing piece is a
  publish/export step (FEAT-7) and a reliable upload path (FEAT-5).

---

## Features to add

### FEAT-1 — Standalone RAG search bar (not just chat)
- **Status:** DONE (Phase 3c)
- **Idea:** A search bar that runs corpus retrieval and shows ranked passages directly, bypassing the chat round-trip.
- **Resolution:** The top-bar search input (previously inert) navigates on Enter to a
  server-component results page `/workspaces/[id]/search?q=…` that runs `retrieve()`
  directly (no API route) and lists ranked passages, each a `passageHref` jump link into
  the paper at the passage (scroll + flash). Search is literal (no 3b query rewrite).

### FEAT-2 — Multiple highlighter colors
- **Status:** SUPERSEDED / wontfix (replaced by the theme focus filter, Phase 2)
- **Idea:** Let users pick highlight colors.
- **Decision:** Dropped. Highlights can carry multiple themes and real collections have
  many themes, so "color = theme" breaks on multi-theme highlights and exhausts the
  ~6–8 distinguishable colors. Replaced by a **theme focus filter** in the reader: pick a
  theme → its highlights stay lit, others dim, the notes rail filters to it. Helpers
  `matchesThemeFocus`/`isDimmed` (`src/lib/annotate/themeFilter.ts`); `.hl-dim` CSS.

### FEAT-3 — A "Papers" tab (all uploaded papers in the workspace)
- **Status:** DONE (Phase 4a)
- **Idea:** A library view of every paper in the workspace so they can be added to other collections later.
- **Resolution:** New `paper_collections` M:N junction (backfilled from `papers.collectionId`,
  which is kept as a "home" pointer); membership service `src/lib/papers/collections.ts`.
  A paper can belong to 0..N collections. New sidebar **Papers** → `/workspaces/[id]/papers`
  library listing every workspace paper with its collections + "Add to collection"
  (`AddToCollection`); link/unlink via `/api/papers/[id]/collections`. Collection page,
  matrix, dashboard counts, theme-tagging, and retrieval collection-scope all read
  membership from the junction, so a reused paper appears (and is searchable) in every
  collection it's added to. Spec/plan in `docs/superpowers/{specs,plans}/2026-06-04-phase4a-*`.

### FEAT-4 — Literature matrix usability upgrade (esp. small / half screens)
- **Status:** DONE (Phase 4d)
- **Idea:** Make `MatrixGrid.tsx` responsive and usable on narrow viewports.
- **Resolution:** The matrix already had sticky header + first column + scroll; the fix was
  making it **full-bleed** (`.app-canvas:has(.matrix-page)` opts out of the centered/padded
  shell canvas) so it fills the content area with a bounded height — making the sticky
  scroll actually work — plus a `@media (max-width: 900px)` block that drops the table
  min-width and tightens the first-column/cell widths so more fits on a half-screen before
  horizontal scrolling. CSS-only (reuses the `:has()` full-bleed pattern from chat). A
  stacked card view at phone widths was deferred.

### FEAT-5 — Rework "upload review" UX (stuck pending → disappears)
- **Status:** Phase-1 reliability fixes DONE; Phase-4 redesign (attach-to-paper) still open
- **Report:** Uploading a review document stays pending, says refresh, then disappears.
- **Root cause (3 parts):** (1) the upload poller only polled *papers* — reviews had no
  status route, so the UI printed "Review processing status unavailable — refresh the
  page" and never updated; (2) the "Recent imports" list is ephemeral React state, wiped
  on refresh; (3) a review uploaded with collection "— none —" (`collectionId: null`) is
  listed *nowhere* (reviews only render under their collection). The backend pipeline
  itself reaches `ready` fine (regression test added in `upload-flow.test.ts`).
- **Fixes done:** added `GET /api/reviews/[id]` status route; `UploadForm` now polls
  reviews like papers (removed the dead "refresh" message); reviews now require a
  collection (server guard in `/api/upload` + client guard) so they never orphan.
- **Attach-to-paper DONE (Phase 4c):** the reader now shows a "Reviews citing this paper"
  section, derived automatically from each review's annotation entries
  (`reviewsCitingPaper` in `src/lib/reviews/service.ts`). Linkage stays in sync with what
  the review actually cites; no manual linking.
- **Still open (minor, later):** a durable/server-fetched recent-imports list; a global
  reviews view; a per-paper review *count* on list rows.

### FEAT-6 — Profile page
- **Status:** DONE (Phase 5)
- **Idea:** A user profile page.
- **Resolution:** Top-level `/account` page (`src/app/account/page.tsx`): editable **display
  name** (`setDisplayName` in `src/lib/users.ts` + `updateDisplayNameAction` server action),
  read-only email + role, your workspaces (links), and sign out. The topbar avatar and the
  home "Signed in as…" now link to it.

### FEAT-7 — Publish / export a review
- **Status:** DONE (Phase 4b)
- **Idea:** Finish the "create new review" half of the vision: a publish/export step
  for composed reviews (PDF and/or markdown, plus a read/share view).
- **Resolution:** First closed the composer's stubs — **prose edits and the title now
  persist** (`updateProseEntry` + entries PATCH `{prose}`, debounced composer save; PATCH
  `/api/reviews/[id]` for title). **Publish** sets `status: 'published'` (added to the
  TS-only `statusValues`, no migration) with a Published badge. **Export** = client-side
  markdown download (`reviewToMarkdown` in `src/lib/reviews/export.ts`) + a printable read
  view (`@media print` → browser Save-as-PDF). No public links / server-side PDF (deferred).

---

## Phases

Grouped so each phase touches a coherent set of files and unblocks the next. Order is
a proposal — reprioritize freely. "Effort" is rough.

### Phase 0 — Quick wins (low effort, high visibility)
Build momentum; mostly CSS/state fixes, no schema.
- BUG-8 — chat message spacing (CSS)
- BUG-3 — stale highlight/note icon after delete (state)
- BUG-10 — author stamp on inline annotations (likely small)

### Phase 1 — Stabilize core (things that break trust)
Reliability first — these make people distrust the app.
- BUG-1 — confirm/fix Google login (needs repro)
- BUG-2 — make note saving reliable (decouple embedding from the save path)
- FEAT-5 — fix review upload getting stuck pending → disappearing (surface `errorReason`)

### Phase 2 — Reader & annotation experience
All centered on `AnnotationReader.tsx` + the annotation flow — touch it once.
- BUG-5 — create a theme inline when highlighting (API exists, UI missing)
- FEAT-2 — multiple highlighter colors (adds `annotations.color`)
- BUG-4 — wire the reader settings gear (reader prefs: font size, colors, author filter)
- BUG-9 — deep-link to the exact passage/annotation (anchored URLs + scroll-to-flash)

### Phase 3 — Chat & RAG
- BUG-7 — chat windowing (fixed composer) + chat sessions & history (NEW schema)
- BUG-6 — looser/smarter retrieval (query expansion, K, softened prompt)
- BUG-9 — chat citations deep-link into the paper (shared with Phase 2)
- FEAT-1 — standalone RAG search bar (reuse retrieval)

### Phase 4 — Synthesis & reviews (the vision)
The centralized, reusable store + create/store reviews.
- FEAT-3 — Papers tab / reusable paper library across collections (schema decision)
- FEAT-4 — literature matrix usability on small/half screens
- FEAT-7 — publish/export composed reviews
- FEAT-5 (cont.) — attach reviews to the papers they draw from

### Phase 5 — Account & polish
- FEAT-6 — profile page

### Cross-cutting note
BUG-9 spans Phases 2 and 3 (one anchoring mechanism, two call sites). Building the
anchor/scroll-to behavior in Phase 2 makes the chat side in Phase 3 nearly free.
