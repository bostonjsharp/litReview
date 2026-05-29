# LitReview — Workspaces Design (replaces the email allowlist)

**Date:** 2026-05-29
**Status:** Approved (design)
**Builds on:** Phases 1, 2, 3a. Changes the access model introduced in Phase 1 (Auth.js + email allowlist).
**Scope:** One cohesive change — workspace-based multi-tenancy, membership, invite-by-link, and scoping existing features to a workspace. Replaces the allowlist entirely.

## Context & Goals

Today, access is gated by an email allowlist (`ALLOWED_EMAILS` + an `isAllowed` `signIn` callback). The team wants collaboration instead: any Google-authenticated user can sign in, **create a workspace**, and **share it** so teammates can join and collaborate on the same papers, reviews, annotations, and themes. Workspace membership — not an allowlist — governs who can see and edit content.

Decisions from brainstorming:
- **Join by shareable invite link/code** (no email infrastructure). A workspace has a single regenerable `inviteCode`; regenerating revokes old links.
- **Existing dev data is throwaway** — the migration may reset the affected content tables; no backfill needed.
- **Roles:** creator is `owner`; others are `member`. The owner manages membership and the invite code and can delete the workspace; all members read and write content equally.
- **Google sign-in stays** as identity; workspaces are the authorization/tenancy layer on top.

> Operational note (separate from this design): Google OAuth must be configured (`AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`) for sign-in to work at all — currently empty, which is why login fails with "Missing required parameter: client_id." That is a credentials/config task, not part of this code change.

## Non-Goals

- Email invitations (later; invite link only now).
- Per-collection or per-resource permissions (membership is workspace-wide).
- Roles beyond `owner`/`member`.
- Real-time presence / collaborative cursors.
- Migrating/backfilling existing dev data.

## Architecture

Replace the allowlist with workspace tenancy. Adds two tables (`workspaces`, `workspace_members`), a `workspaceId` column on the top-level objects (`collections`, `papers`, `reviews`, `chunks`), membership-enforcement helpers, onboarding/dashboard/invite UI, and a one-line scope addition to retrieval. Membership is checked on every workspace-scoped route.

## Data Model

### `workspaces`
- `id` (uuid, pk)
- `name` (text, not null)
- `ownerId` (uuid, FK → users)
- `inviteCode` (text, not null, unique) — regenerable; the join token
- `createdAt` (timestamp)

### `workspace_members`
- `workspaceId` (uuid, FK → workspaces, on delete cascade)
- `userId` (uuid, FK → users, on delete cascade)
- `role` (text enum: `owner` | `member`, not null)
- Primary key = (`workspaceId`, `userId`).

### Changes to existing tables
- Add `workspaceId` (uuid, **not null**, FK → workspaces, on delete cascade) to: `collections`, `papers`, `reviews`, `chunks`.
- `annotations` inherit their workspace via their paper; `themes` via their collection; `review_entries` via their review — no direct column on those.
- **Migration / throwaway data:** because existing rows have no workspace and the data is disposable, the migration empties the affected content tables (`chunks`, `annotation_themes`, `annotations`, `review_entries`, `review_paper_links`, `reviews`, `papers`, `themes`, `collections`) before adding the non-null `workspaceId`. The test DB always starts from a fresh schema, so tests are unaffected.

## Auth & Membership

- **Remove** `ALLOWED_EMAILS`, the `isAllowed` helper, and the allowlist `signIn` callback in `src/auth.ts`. Any Google-authenticated user may sign in. (`src/lib/allowlist.ts` and its unit test are deleted.)
- Keep `requireUser()` (returns the user or null → 401).
- Add **`requireMember(workspaceId, userId, deps)`** → returns the membership row or throws/returns null so routes can answer **403** for non-members.
- **Object routes** (paper, collection, review, annotation, theme, matrix, chat) resolve the owning `workspaceId` from the object and call `requireMember`.
- **Onboarding redirect:** middleware/page logic sends a signed-in user with **no** workspace membership to `/onboarding`.

## Workspaces & Invites

- **Create** (`POST /api/workspaces` `{name}`): insert the workspace with a generated `inviteCode`, add the creator to `workspace_members` as `owner`. Return the workspace.
- **List** (`GET /api/workspaces`): the workspaces the current user is a member of.
- **Join** (`POST /api/workspaces/join` `{code}` or a `/join/[code]` page action): look up the workspace by `inviteCode`; add the current user as `member` (idempotent if already a member); invalid/revoked code → friendly error.
- **Manage** (owner only): rename (`PATCH /api/workspaces/[id]`), list members (`GET /api/workspaces/[id]/members`), remove a member (`DELETE /api/workspaces/[id]/members/[userId]`), regenerate invite code (`POST /api/workspaces/[id]/invite-code`), delete workspace (`DELETE /api/workspaces/[id]`). Guard: the last owner cannot be removed; owner-only actions reject non-owners with 403.

## Scoping Existing Features

- `collections`, `papers`, `reviews`, `chunks` carry `workspaceId`. Creating any of them requires a workspace context (the `workspaceId` is supplied/derived and the user must be a member).
- **Ingestion**: when the pipeline writes `chunks`, it stamps the parent's `workspaceId` on each chunk (papers/reviews already know their workspace; annotation chunks copy it from the paper).
- **Retrieval/chat**: `RetrieveScope` gains `workspaceId`, and `retrieve` filters `chunks` by it. The chat route requires a `workspaceId` (and membership) so answers never draw from another workspace. The existing collection/paper scope still narrows within the workspace.
- **Pages**: the reader, matrix, and composer resolve the workspace from the object and enforce membership before rendering.

## Screens (functional versions; visual design handed to Claude Design)

- **Sign in** — Google sign-in + product value prop.
- **Onboarding** — create a workspace (name) or join one (paste invite code / open invite link).
- **Home / switcher** — list the user's workspaces; create/join entry points.
- **Workspace dashboard** — the workspace's collections and entry to members/invite.
- **Members & invite** — member list, copy invite link, regenerate code, remove member (owner controls gated).

## Error Handling

- Non-member accessing a workspace resource → **403**.
- Owner-only action by a non-owner → **403**.
- Removing the last owner → **400** (blocked).
- Invalid/revoked invite code → **404/400** with a friendly message.
- All new routes use `requireUser`→401 and Zod validation; workspace-scoped routes also `requireMember`→403.

## Testing Strategy

- **Unit**: invite-code generation (unique, URL-safe); role/last-owner guard logic (pure function over a member list).
- **Integration** (real Neon): create workspace (owner+member rows + code); join by code (idempotent); member vs non-member access returns membership/403; **workspace-scoped retrieval excludes another workspace's chunks**; regenerate code invalidates the old one; remove member; last-owner removal blocked.
- **Light E2E**: simulate two users sharing one workspace via invite code → a collection created by one is visible to the other (and not to a third non-member).

## Watch-Items / Risks

1. **Tenancy leaks.** The highest risk is a query that forgets to filter by workspace. Mitigated by stamping `workspaceId` on `chunks` and filtering retrieval by it, and by `requireMember` on every workspace-scoped route — both covered by an explicit cross-workspace isolation test.
2. **Non-null `workspaceId` migration.** Existing rows lack a workspace; since data is throwaway the migration empties the content tables first, then adds the not-null column.
3. **Onboarding loop.** A signed-in user with no membership must reach `/onboarding` without being redirected away by membership checks; `/onboarding`, `/join/[code]`, and auth routes are exempt from the "must be a member" gate.

## Relationship to other phases
This is an access-model change layered across the existing Phases 1–3a, not a new feature phase. After it lands, the remaining Phase 3 slices (contradiction/gap detection, export, citation→paper linking) build on top, now workspace-scoped.
