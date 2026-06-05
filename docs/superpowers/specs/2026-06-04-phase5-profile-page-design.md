# Phase 5 — Profile / Account Page (Design)

Date: 2026-06-04
Status: approved (design approved inline)
Backlog item: FEAT-6

## Goal

A profile page where a user can view/edit their display name, see their workspaces, and
sign out. The new capability is **editing the display name** (`users.name` has no UI
today); workspaces + sign out already exist on the home page and are consolidated here.

## Decisions

- Dedicated **top-level `/account`** route (like `/`, `/login`), outside the workspace
  shell, with its own minimal header + a back-to-workspaces link.
- Name editing is a **simple Save form** via a server action (no live inline edit, no
  client JS) — matching how sign-in/out work.

## Current state

- `users`: `{ id, email (unique), name (nullable), role, createdAt }`.
- Auth: NextAuth + Google. `signOutAction` / `signInAction` in `src/app/actions/auth.ts`.
- Home `/` (`src/app/page.tsx`) already lists the user's workspaces + "Signed in as
  &lt;email&gt;" + a Sign out form. The topbar avatar (`title="Your account"`) links to `/`.
- `ensureUser(email, name, deps)` in `src/lib/users.ts` resolves/creates the user row.
- No UI to set/edit `users.name`.

## Architecture

### 1. Name service — `src/lib/users.ts`

```ts
setDisplayName(userId: string, name: string, deps: { db; schema }): Promise<void>
```
Updates `users.name` (trimmed; empty → null so the UI falls back to the email).
Unit/integration-tested.

### 2. Server action — `src/app/actions/profile.ts`

```ts
'use server';
export async function updateDisplayNameAction(formData: FormData): Promise<void>
```
`auth()` → if no session email, return (no-op); `ensureUser(email, name)` to get the row;
`setDisplayName(user.id, String(formData.get('name') ?? ''))`; `revalidatePath('/account')`.

### 3. Page — `src/app/account/page.tsx` (server component)

- `auth()` → redirect `/login` if no session; resolve the user row + their workspaces
  (the same membership query the home page uses).
- Renders: a minimal header (brand + ThemeToggle + Sign out form + back-to-workspaces
  link), an **Avatar**, an **editable display-name form** (`<form action=
  {updateDisplayNameAction}>` with a text input prefilled with the current name + a Save
  button), read-only **email** and **role**, and the **workspaces** list (links to
  `/workspaces/[id]`).
- Reuse existing classes/components (`Avatar`, `Icon`, `ThemeToggle`, `card`, `home-*`
  patterns where they fit) — no new visual system.

### 4. Wiring

- Topbar avatar link (`src/components/chrome/Topbar.tsx`): `href="/"` → `href="/account"`.
- Home "Signed in as &lt;email&gt;" (`src/app/page.tsx`): make it a link to `/account`
  (small touch).

## Data flow

```
/account (server) → auth() → user + workspaces → render
Save name → form POST → updateDisplayNameAction → setDisplayName → revalidate /account
Sign out → signOutAction (existing) → /login
```

## Error handling

- No session on `/account` → redirect `/login` (consistent with home).
- `updateDisplayNameAction` with no session email → no-op (the page is already gated, so
  this is defense-in-depth).
- Empty name → stored as null; the page/avatar fall back to the email.

## Testing

- **`setDisplayName`** (`tests/integration/user-profile.test.ts`, Neon test DB): updates
  the name; trims; empty/whitespace → null.
- **Action + page + topbar wiring** — `tsc`/`eslint`/`build` + a manual check (server
  action + server component + a one-line link change, this repo's boundary).

## Out of scope

- Avatar image upload; changing email; account deletion; notification/prefs; per-workspace
  display names.

## Risks / notes

- `/account` is a new top-level route — confirm it isn't accidentally caught by the
  workspace `(app)` layout (it's a sibling of `/`, `/login`, so it uses the root layout).
- Keep the page server-rendered with a server-action form; no client component needed.
