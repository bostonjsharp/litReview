# Phase 4a — Reusable Paper Library (Design)

Date: 2026-06-04
Status: approved (design approved inline; proceeding to plan)
Backlog item: FEAT-3

## Goal

Make papers reusable across collections instead of locked to one, and add a workspace
"Papers" library to view every uploaded paper and add it to other collections. This is
the foundational piece of the vision: one centralized store of papers applicable to many
projects.

This is **slice 4a** of Phase 4. 4b (publish/export reviews), 4c (attach reviews to
papers), and 4d (matrix UX) are separate slices.

## Decisions made during brainstorming

- **Many-to-many membership** via a `paper_collections` junction; a paper can belong to
  **0..N** collections.
- **Keep `papers.collectionId`** as a nullable "home" pointer (where it was uploaded) —
  vestigial for membership, but kept to avoid churn and to seed the backfill. Membership
  is read **only** from the junction.
- **Do the full retrieval-scope rework now**: collection-scoped chat/search resolves
  membership through the junction so reused papers are included (otherwise the feature is
  half-real).
- **Unlink ≠ delete**: removing a paper from a collection keeps it in the workspace
  library.

## Current state (what we're changing)

- `papers.collectionId` (nullable, → collections) is the sole membership field.
- "Papers in collection X" is queried as `WHERE papers.collectionId = X` in: the
  collection page (`…/collections/[cid]/page.tsx`), the matrix page
  (`…/collections/[cid]/matrix/page.tsx`), and the workspace dashboard
  (`…/(app)/page.tsx`, per-collection counts).
- `chunks.collectionId` is set at ingest to the paper's collection and used by
  `retrieve.ts` for collection scope (`eq(chunks.collectionId, X)`).
- Upload (`/api/upload`) sets `papers.collectionId` and the pipeline sets
  `chunks.collectionId`.
- No workspace-level papers view; the sidebar has Collections / Literature matrix / Chat /
  Members but no "Papers".

## Architecture

### 1. Schema — `paper_collections` junction (+ migration + backfill)

```
paper_collections:
  paperId      uuid not null → papers(id) on delete cascade
  collectionId uuid not null → collections(id) on delete cascade
  primary key (paperId, collectionId)
```
(Follows the existing junction style, e.g. `annotation_themes`/`workspace_members`.)

Migration: `npm run db:gen` creates the table; then **append a backfill** to the
generated SQL so existing membership is preserved:
```sql
INSERT INTO "paper_collections" ("paper_id", "collection_id")
SELECT "id", "collection_id" FROM "papers"
WHERE "collection_id" IS NOT NULL
ON CONFLICT DO NOTHING;
```
`papers.collectionId` is **kept** (home pointer); not dropped.

### 2. Membership service — `src/lib/papers/collections.ts` (new, DI'd)

```ts
addPaperToCollection(paperId, collectionId, deps)   // idempotent insert (onConflictDoNothing)
removePaperFromCollection(paperId, collectionId, deps)
collectionPaperIds(collectionId, deps): Promise<string[]>      // paper ids in a collection
paperCollectionIds(paperId, deps): Promise<string[]>           // collections a paper is in
listWorkspacePapers(workspaceId, deps)                         // all papers + their collection ids
```
Small, testable functions over the junction (mirrors `lib/annotate/service.ts` style).

### 3. Membership queries switch to the junction

- **Collection page**: list papers via `JOIN paper_collections pc ON pc.paper_id = papers.id
  WHERE pc.collection_id = cid` (instead of `papers.collectionId = cid`). Annotation
  counts unchanged (per paper).
- **Matrix page**: same join for the collection's papers; themes and tagged-annotation
  queries unchanged (themes are per-collection; annotations per-paper).
- **Dashboard** per-collection paper counts: count via the junction.

### 4. Papers library (the "Papers tab")

- **Sidebar**: add a **Papers** entry → `/workspaces/[id]/papers`.
- **Library page** `…/(app)/papers/page.tsx` (server component): lists every workspace
  paper (`listWorkspacePapers`) with title/meta, its collection chips, and an **Add to
  collection** menu (the workspace's collections, minus ones it's already in). Ready
  papers link into the reader.
- **Collection page**: an **Add existing paper** control to pull a library paper into the
  current collection (excludes papers already in it).

### 5. Link/unlink API

- `POST /api/papers/[id]/collections` body `{ collectionId }` → `addPaperToCollection`
  (member-guarded; verify the paper and collection are in the same workspace).
- `DELETE /api/papers/[id]/collections/[collectionId]` → `removePaperFromCollection`
  (unlink only; the paper stays in the workspace).

### 6. Retrieval collection-scope via membership (`retrieve.ts`)

Replace the collection filter. When `scope.collectionId` is set, instead of
`eq(chunks.collectionId, X)`, match chunks whose **parent belongs to the collection**:
```
(parentType = 'paper'      AND parentId IN  collectionPaperIds(X))
OR (parentType = 'review'  AND parentId IN  reviewIdsInCollection(X))
OR (parentType = 'annotation' AND parentId IN annotationIdsOnCollectionPapers(X))
```
Implemented with Drizzle `inArray` over id-sets resolved up front (small N for a
collection). `chunks.collectionId` is left in place (origin metadata) but is no longer the
collection-scoping key. Workspace scope (`chunks.workspaceId`) and paper scope
(`parentId`) are unchanged.

### 7. Upload

Unchanged default (upload into the selected collection): set `papers.collectionId` (home)
**and** insert a `paper_collections` row. A paper uploaded with no collection lands in the
library only. Reviews still require a collection (Phase 1 guard unchanged). The ingest
pipeline still stamps `chunks.collectionId` with the home collection (harmless metadata).

## Data flow

```
Upload paper → papers(home=C) + paper_collections(P,C) + chunks(...)
Library "Add to collection D" → POST /api/papers/P/collections {D} → paper_collections(P,D)
Collection D page → papers via JOIN paper_collections (includes reused P)
Collection-D chat → retrieve(scope=D) → membership-resolved chunk ids (includes P's chunks)
```

## Error handling

- Add/remove guarded by `requireMember`; reject if the paper's workspace ≠ the
  collection's workspace (no cross-workspace linking). Idempotent add (no duplicate-key
  error). Removing a non-existent link is a no-op.
- A paper in zero collections is valid (library-only); collection pages simply don't list
  it.

## Testing strategy

- **Membership service** (`tests/integration/paper-collections.test.ts`, Neon test DB):
  add is idempotent; a paper added to two collections appears in both
  `collectionPaperIds`; remove unlinks without deleting the paper; `listWorkspacePapers`
  returns workspace papers with their collection ids.
- **Retrieval includes reused papers** (extend `retrieve.test.ts` or a new
  `retrieve-collection.test.ts`): a paper whose `chunks.collectionId` is collection A but
  which is linked to collection B is retrieved under `scope.collectionId = B`.
- **Backfill**: a focused test/assertion that after migration every paper with a
  `collectionId` has a matching junction row (can be covered by the membership test
  seeding via the service; the SQL backfill itself is verified by the migration applying
  cleanly + an integration check).
- **Library/collection UI, sidebar, add/remove routes** — `tsc`/`eslint`/`build` + manual
  click-through (route handlers + server/client components, this repo's boundary).

## Out of scope (later slices)

- Publish/export reviews (4b), attach reviews to papers (4c), matrix small-screen UX (4d).
- Moving/merging collections; bulk add-to-collection; per-collection paper ordering.
- Dropping `papers.collectionId` entirely (kept as home pointer).
- Re-stamping `chunks.collectionId` on link (not needed — scoping is membership-based).

## Risks / notes

- The retrieval-scope change is the riskiest part; it must keep workspace/paper scopes
  intact and only alter the collection branch. Cover it with the reused-paper retrieval
  test.
- Many read sites use `papers.collectionId`; switching membership to the junction must hit
  all "papers in a collection" reads (collection page, matrix, dashboard). `grep` for
  `collectionId` to confirm none are missed (the immersive reader/back-link uses the
  paper's home `collectionId`, which is fine to keep).
- Backfill must be idempotent (`ON CONFLICT DO NOTHING`) so re-running migrations on the
  test DB is safe.
