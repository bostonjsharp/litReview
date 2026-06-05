# Phase 5 — Profile / Account Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A `/account` page to edit your display name, see your workspaces, and sign out.

**Architecture:** A `setDisplayName` service (TDD); a `updateDisplayNameAction` server action; a top-level `/account` server-component page (reusing the home-page layout patterns); and a one-line topbar-avatar link change.

**Tech Stack:** Next.js App Router (server components + server actions), Drizzle/Postgres (Neon), Vitest, NextAuth.

Spec: `docs/superpowers/specs/2026-06-04-phase5-profile-page-design.md`

## File map
- `src/lib/users.ts` — `setDisplayName` (modify)
- `src/app/actions/profile.ts` — `updateDisplayNameAction` (new)
- `src/app/account/page.tsx` — the account page (new)
- `src/components/chrome/Topbar.tsx` — avatar links to `/account` (modify)
- `src/app/page.tsx` — "Signed in as …" links to `/account` (modify)
- Test: `tests/integration/user-profile.test.ts`

---

### Task 1: `setDisplayName` (TDD)

**Files:** `src/lib/users.ts`; Test `tests/integration/user-profile.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from '../helpers/testdb';
import { setDisplayName } from '@/lib/users';

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => { ctx = await makeTestDb(); });
afterAll(async () => { await ctx.sql.end(); });
function deps() { return { db: ctx.db, schema: ctx.schema }; }

describe('setDisplayName', () => {
  it('trims and sets the name; whitespace-only clears it to null', async () => {
    const [u] = await ctx.db.insert(ctx.schema.users).values({ email: `e${Math.random()}@x.io`, name: 'Old' }).returning();
    await setDisplayName(u.id, '  New Name  ', deps());
    let [row] = await ctx.db.select().from(ctx.schema.users).where(eq(ctx.schema.users.id, u.id));
    expect(row.name).toBe('New Name');
    await setDisplayName(u.id, '   ', deps());
    [row] = await ctx.db.select().from(ctx.schema.users).where(eq(ctx.schema.users.id, u.id));
    expect(row.name).toBeNull();
  });
});
```

- [ ] **Step 2: Run → FAIL** (`npx vitest run tests/integration/user-profile.test.ts`) — `setDisplayName` not exported.

- [ ] **Step 3: Implement** — add to `src/lib/users.ts` (the file already imports `eq` and defines the `Deps` shape):

```ts
export async function setDisplayName(userId: string, name: string, deps: Deps): Promise<void> {
  const trimmed = name.trim();
  await deps.db
    .update(deps.schema.users)
    .set({ name: trimmed.length > 0 ? trimmed : null })
    .where(eq(deps.schema.users.id, userId));
}
```
(If `users.ts` does not already declare a `Deps` interface, add `interface Deps { db: any; schema: any }` near the top — match the existing style; `ensureUser` there already takes a `{ db, schema }` deps object.)

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Commit**

```bash
git add src/lib/users.ts tests/integration/user-profile.test.ts
git commit -m "feat(users): add setDisplayName"
```

---

### Task 2: Server action + `/account` page

**Files:** Create `src/app/actions/profile.ts`; Create `src/app/account/page.tsx`

- [ ] **Step 1: Server action** — `src/app/actions/profile.ts`:

```ts
'use server';
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { db, schema } from '@/db/client';
import { ensureUser, setDisplayName } from '@/lib/users';

export async function updateDisplayNameAction(formData: FormData): Promise<void> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return;
  const user = await ensureUser(email, session.user?.name ?? null, { db, schema });
  await setDisplayName(user.id, String(formData.get('name') ?? ''), { db, schema });
  revalidatePath('/account');
}
```

- [ ] **Step 2: Account page** — `src/app/account/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { db, schema } from '@/db/client';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { initials } from '@/lib/ui/display';
import { signOutAction } from '@/app/actions/auth';
import { updateDisplayNameAction } from '@/app/actions/profile';

export default async function AccountPage() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) redirect('/login');

  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  const workspaces = user
    ? await db
        .select({ id: schema.workspaces.id, name: schema.workspaces.name, role: schema.workspaceMembers.role })
        .from(schema.workspaceMembers)
        .innerJoin(schema.workspaces, eq(schema.workspaceMembers.workspaceId, schema.workspaces.id))
        .where(eq(schema.workspaceMembers.userId, user.id))
    : [];
  const displayName = user?.name || email;

  return (
    <div className="home-stage">
      <header className="home-top themed">
        <Link className="auth-brand" href="/">
          <span className="brand-mark">LR</span>
          <span className="brand-name serif">LitReview</span>
        </Link>
        <div className="row gap2">
          <ThemeToggle />
          <form action={signOutAction}>
            <button className="btn btn-quiet btn-sm">Sign out</button>
          </form>
        </div>
      </header>

      <div className="home-wrap fade-enter">
        <div className="row gap3" style={{ alignItems: 'center', marginBottom: 24 }}>
          <Avatar name={displayName} size={56} />
          <div>
            <h1 style={{ margin: 0 }}>{displayName}</h1>
            <div className="meta">{email} · {user?.role ?? 'member'}</div>
          </div>
        </div>

        <div className="card" style={{ padding: 20, marginBottom: 24 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Display name</div>
          <form action={updateDisplayNameAction} className="row gap2">
            <input className="input" name="name" defaultValue={user?.name ?? ''} placeholder="Your name" style={{ flex: 1 }} />
            <button className="btn btn-primary" type="submit">
              <Icon name="check" size={15} /> Save
            </button>
          </form>
        </div>

        <div className="eyebrow" style={{ marginBottom: 8 }}>Your workspaces</div>
        <div className="ws-list">
          {workspaces.map((w) => (
            <Link key={w.id} href={`/workspaces/${w.id}`} className="card card-hover ws-row">
              <span className="ws-mark">{initials(w.name)}</span>
              <div className="ws-row-main"><h3>{w.name}</h3></div>
              <span className={'role-tag ' + (w.role === 'owner' ? 'role-owner' : 'role-member')}>{w.role}</span>
              <Icon name="chevronRight" size={18} style={{ color: 'var(--faint)' }} />
            </Link>
          ))}
        </div>

        <div style={{ marginTop: 24 }}>
          <Link href="/" className="btn btn-ghost"><Icon name="chevronLeft" size={16} /> Back to workspaces</Link>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify** — `npx tsc --noEmit` (no new src errors) + `npx eslint src/app/actions/profile.ts src/app/account/page.tsx`.

- [ ] **Step 4: Manual check** — visit `/account`: shows your name/email/role, workspaces, sign out. Change the name + Save → it persists (reload shows the new name; the topbar avatar initials update). Empty name → falls back to email.

- [ ] **Step 5: Commit**

```bash
git add src/app/actions/profile.ts src/app/account/page.tsx
git commit -m "feat(account): /account page with editable display name"
```

---

### Task 3: Wire the entry points

**Files:** `src/components/chrome/Topbar.tsx`; `src/app/page.tsx`

- [ ] **Step 1: Topbar avatar → /account** — in `Topbar.tsx`, change the account link:

```tsx
        <Link className="topbar-me" href="/account" title="Your account"><Avatar name={userName} size={32} /></Link>
```
(was `href="/"`.)

- [ ] **Step 2: Home "Signed in as" → /account** — in `src/app/page.tsx`, make the eyebrow a link:

```tsx
          <div className="eyebrow">Signed in as <Link href="/account" style={{ color: 'var(--accent)' }}>{email}</Link></div>
```
(`Link` is already imported in `page.tsx`.)

- [ ] **Step 3: Verify** — `npx tsc --noEmit` + `npx eslint src/components/chrome/Topbar.tsx src/app/page.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/components/chrome/Topbar.tsx src/app/page.tsx
git commit -m "feat(account): link the topbar avatar and home to /account"
```

---

### Task 4: Verification + backlog

- [ ] **Step 1: Suite** — `npx vitest run` → green incl. `user-profile`. No regressions.
- [ ] **Step 2: Typecheck** — `npx tsc --noEmit` → only pre-existing `tests/ui/*` errors.
- [ ] **Step 3: Lint** — `npx eslint src/lib/users.ts src/app/account/page.tsx src/app/actions/profile.ts src/components/chrome/Topbar.tsx src/app/page.tsx` → 0 errors.
- [ ] **Step 4: Build** — `npx next build` → succeeds; routes include `/account`.
- [ ] **Step 5: Backlog** — mark FEAT-6 done in `docs/BACKLOG.md` (account page: editable display name, workspaces, sign out; topbar avatar links here). Commit.

---

## Self-Review

**Spec coverage:**
- `setDisplayName` (trim, empty→null) → Task 1 ✓
- Server action `updateDisplayNameAction` → Task 2 Step 1 ✓
- `/account` page (avatar, editable name form, email/role, workspaces, sign out, back link) → Task 2 Step 2 ✓
- Topbar + home wiring → Task 3 ✓
- Test: setDisplayName integration → Task 1 ✓

**Placeholder scan:** No TBD/TODO; complete code in every step. The `Deps` note in Task 1 Step 3 is conditional but gives the exact fallback.

**Type consistency:** `setDisplayName(userId, name, deps)` defined in Task 1, called by the action in Task 2 with the same `{ db, schema }` deps. `ensureUser(email, name, deps)` matches its existing signature. The page reuses existing classes/components (`Avatar`, `Icon`, `ThemeToggle`, `initials`, `signOutAction`) and the home-page query shape. `/account` is a sibling of `/` (root layout), not under the workspace `(app)` shell.
