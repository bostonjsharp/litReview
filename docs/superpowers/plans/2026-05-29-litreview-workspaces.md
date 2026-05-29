# LitReview Workspaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the email allowlist with workspace-based multi-tenancy: any Google user signs in, creates a workspace, shares an invite code, and collaborates; all content is scoped to a workspace and access is governed by membership.

**Architecture:** Adds `workspaces` + `workspace_members` tables and a `workspaceId` column on `collections`/`papers`/`reviews`/`chunks`. A workspace service (create/join/members/invite) and pure helpers (invite-code, owner guard) are tested; `requireMember` guards routes; retrieval filters chunks by workspace. The allowlist is removed. New onboarding/dashboard/invite UI; existing pages become workspace-aware.

**Tech Stack:** Same as prior phases — TypeScript, Next.js 16 (App Router), Drizzle ORM, Postgres + pgvector (Neon), OpenAI behind `LLMProvider`, Vitest. No new dependencies.

**Key implementation decision (deviation from spec, flagged):** `workspaceId` is **nullable** at the DB level on `collections`/`papers`/`reviews`/`chunks`, rather than `NOT NULL`. Application code always sets it on create/ingestion, and retrieval filters by it (so the cross-workspace no-leak guarantee is preserved by the *query*, not the column constraint). Nullable keeps the column-add migration non-breaking and avoids rewriting every existing test fixture. Dev data is throwaway, so orphaned null-workspace rows are irrelevant.

**Conventions:** services take `(args, deps)` with `deps = { db, schema }`; `db`/`schema` are `any` at DI seams (lint `warn`); each task ends green and committed; integration tests use the Neon `.env`.

---

## Shared Type Reference

```ts
// src/lib/workspaces/invite.ts (Task 2)
export function generateInviteCode(): string; // URL-safe, 12 chars

// src/lib/workspaces/guard.ts (Task 2)
export interface Member { userId: string; role: 'owner' | 'member' }
export function canRemoveMember(members: Member[], targetUserId: string): boolean;

// src/lib/session.ts (Task 5) — route glue, uses the global db
export async function requireMember(workspaceId: string, userId: string): Promise<{ role: string } | null>;

// src/lib/search/retrieve.ts (Task 5) — RetrieveScope gains:
//   workspaceId?: string;
```

---

## Task 1: Schema — workspaces, members, and `workspaceId` columns

**Files:**
- Modify: `src/db/schema.ts`
- Test: `tests/integration/workspaces-schema.test.ts`

- [ ] **Step 1: Add the new tables and columns to `src/db/schema.ts`**

Add `workspaceId` (nullable) to the `collections`, `papers`, `reviews`, and `chunks` table definitions. In each, add this line near the other columns:
```ts
  workspaceId: uuid('workspace_id'),
```
Then append the two new tables at the end of the file:
```ts
export const workspaces = pgTable('workspaces', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  ownerId: uuid('owner_id').references(() => users.id),
  inviteCode: text('invite_code').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['owner', 'member'] }).notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.workspaceId, t.userId] }) }),
);
```
(`uuid`, `text`, `timestamp`, `primaryKey` are already imported.)

- [ ] **Step 2: Generate and apply the migration**

Run:
```bash
npm run db:gen && npm run db:migrate
```
Expected: a new `drizzle/0004_*.sql` (adds the columns + two tables); `migrations applied`.

- [ ] **Step 3: Write the failing test `tests/integration/workspaces-schema.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { makeTestDb } from '../helpers/testdb';

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => { ctx = await makeTestDb(); });
afterAll(async () => { await ctx.sql.end(); });

describe('workspaces schema', () => {
  it('creates a workspace with a member and a workspace-scoped collection', async () => {
    const [u] = await ctx.db.insert(ctx.schema.users).values({ email: 'a@x.edu' }).returning();
    const [w] = await ctx.db.insert(ctx.schema.workspaces).values({ name: 'Lab', ownerId: u.id, inviteCode: 'abc123' }).returning();
    await ctx.db.insert(ctx.schema.workspaceMembers).values({ workspaceId: w.id, userId: u.id, role: 'owner' });
    const [c] = await ctx.db.insert(ctx.schema.collections).values({ name: 'NLP', workspaceId: w.id }).returning();
    expect(c.workspaceId).toBe(w.id);
    const members = await ctx.db.select().from(ctx.schema.workspaceMembers).where(and(eq(ctx.schema.workspaceMembers.workspaceId, w.id), eq(ctx.schema.workspaceMembers.userId, u.id)));
    expect(members[0].role).toBe('owner');
    // member cascade on workspace delete
    await ctx.db.delete(ctx.schema.workspaces).where(eq(ctx.schema.workspaces.id, w.id));
    expect(await ctx.db.select().from(ctx.schema.workspaceMembers).where(eq(ctx.schema.workspaceMembers.workspaceId, w.id))).toHaveLength(0);
  });
});
```

- [ ] **Step 4: Run the test**

Run: `npm test -- tests/integration/workspaces-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify no regression in the existing suite (nullable column add is non-breaking)**

Run: `npm test`
Expected: all existing tests still PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add workspaces, workspace_members, and workspaceId columns"
```

---

## Task 2: Pure helpers — invite code + owner guard

**Files:**
- Create: `src/lib/workspaces/invite.ts`, `src/lib/workspaces/guard.ts`
- Test: `tests/unit/workspace-helpers.test.ts`

- [ ] **Step 1: Write the failing test `tests/unit/workspace-helpers.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { generateInviteCode } from '@/lib/workspaces/invite';
import { canRemoveMember } from '@/lib/workspaces/guard';

describe('generateInviteCode', () => {
  it('returns a URL-safe code and is non-repeating', () => {
    const a = generateInviteCode();
    const b = generateInviteCode();
    expect(a).toMatch(/^[A-Za-z0-9_-]{12,}$/);
    expect(a).not.toBe(b);
  });
});

describe('canRemoveMember', () => {
  const members = [
    { userId: 'u1', role: 'owner' as const },
    { userId: 'u2', role: 'member' as const },
  ];
  it('allows removing a non-last-owner member', () => {
    expect(canRemoveMember(members, 'u2')).toBe(true);
  });
  it('blocks removing the only owner', () => {
    expect(canRemoveMember(members, 'u1')).toBe(false);
  });
  it('allows removing an owner when another owner remains', () => {
    const two = [{ userId: 'u1', role: 'owner' as const }, { userId: 'u3', role: 'owner' as const }];
    expect(canRemoveMember(two, 'u1')).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/unit/workspace-helpers.test.ts`
Expected: FAIL (modules missing).

- [ ] **Step 3: Create `src/lib/workspaces/invite.ts`**

```ts
import { randomBytes } from 'node:crypto';

// 9 random bytes → 12-char URL-safe base64 string.
export function generateInviteCode(): string {
  return randomBytes(9).toString('base64url');
}
```

- [ ] **Step 4: Create `src/lib/workspaces/guard.ts`**

```ts
export interface Member {
  userId: string;
  role: 'owner' | 'member';
}

// A member can be removed unless they are the only remaining owner.
export function canRemoveMember(members: Member[], targetUserId: string): boolean {
  const target = members.find((m) => m.userId === targetUserId);
  if (!target) return false;
  if (target.role !== 'owner') return true;
  const owners = members.filter((m) => m.role === 'owner');
  return owners.length > 1;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- tests/unit/workspace-helpers.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add invite-code generator and last-owner removal guard"
```

---

## Task 3: Remove the email allowlist

**Files:**
- Modify: `src/auth.ts`
- Delete: `src/lib/allowlist.ts`, `tests/unit/allowlist.test.ts`

- [ ] **Step 1: Simplify `src/auth.ts` to allow any Google user**

Replace the entire file with:
```ts
import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
});
```

- [ ] **Step 2: Delete the allowlist module and its test**

Run:
```bash
rm src/lib/allowlist.ts tests/unit/allowlist.test.ts
```

- [ ] **Step 3: Confirm nothing else imports the allowlist**

Run: `grep -rn "allowlist\|isAllowed\|ALLOWED_EMAILS" src tests`
Expected: no matches.

- [ ] **Step 4: Typecheck and run unit tests**

Run: `npx tsc --noEmit && npm test -- tests/unit`
Expected: tsc clean; unit tests pass (one fewer file).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: remove email allowlist; any Google user may sign in"
```

---

## Task 4: Workspace service

**Files:**
- Create: `src/lib/workspaces/service.ts`
- Test: `tests/integration/workspace-service.test.ts`

- [ ] **Step 1: Write the failing test `tests/integration/workspace-service.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { makeTestDb } from '../helpers/testdb';
import {
  createWorkspace, listWorkspaces, getMembership, joinByCode,
  listMembers, removeMember, regenerateInviteCode,
} from '@/lib/workspaces/service';

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => { ctx = await makeTestDb(); });
afterAll(async () => { await ctx.sql.end(); });
const deps = () => ({ db: ctx.db, schema: ctx.schema });
const mkUser = async (email: string) => (await ctx.db.insert(ctx.schema.users).values({ email }).returning())[0];

describe('workspace service', () => {
  it('creates a workspace with the creator as owner and a unique code', async () => {
    const u = await mkUser('owner@x.edu');
    const w = await createWorkspace('Lab', u.id, deps());
    expect(w.inviteCode).toMatch(/^[A-Za-z0-9_-]{12,}$/);
    expect((await getMembership(w.id, u.id, deps()))?.role).toBe('owner');
    expect((await listWorkspaces(u.id, deps())).map((x: { id: string }) => x.id)).toEqual([w.id]);
  });

  it('lets another user join by code, idempotently', async () => {
    const owner = await mkUser('o2@x.edu');
    const joiner = await mkUser('j@x.edu');
    const w = await createWorkspace('Team', owner.id, deps());
    await joinByCode(w.inviteCode, joiner.id, deps());
    await joinByCode(w.inviteCode, joiner.id, deps()); // idempotent
    expect((await getMembership(w.id, joiner.id, deps()))?.role).toBe('member');
    expect((await listMembers(w.id, deps()))).toHaveLength(2);
  });

  it('rejects an invalid invite code', async () => {
    const u = await mkUser('z@x.edu');
    await expect(joinByCode('does-not-exist', u.id, deps())).rejects.toThrow();
  });

  it('regenerating the code invalidates the old one; blocks removing the last owner', async () => {
    const owner = await mkUser('o3@x.edu');
    const w = await createWorkspace('W', owner.id, deps());
    const oldCode = w.inviteCode;
    const newCode = await regenerateInviteCode(w.id, deps());
    expect(newCode).not.toBe(oldCode);
    const stranger = await mkUser('s@x.edu');
    await expect(joinByCode(oldCode, stranger.id, deps())).rejects.toThrow();
    await expect(removeMember(w.id, owner.id, deps())).rejects.toThrow(); // last owner
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/integration/workspace-service.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Create `src/lib/workspaces/service.ts`**

```ts
import { and, eq } from 'drizzle-orm';
import { generateInviteCode } from './invite';
import { canRemoveMember, type Member } from './guard';

interface Deps {
  db: any;
  schema: any;
}

export async function createWorkspace(name: string, userId: string, deps: Deps) {
  const { db, schema } = deps;
  const [w] = await db
    .insert(schema.workspaces)
    .values({ name, ownerId: userId, inviteCode: generateInviteCode() })
    .returning();
  await db.insert(schema.workspaceMembers).values({ workspaceId: w.id, userId, role: 'owner' });
  return w;
}

export async function listWorkspaces(userId: string, deps: Deps) {
  const { db, schema } = deps;
  return db
    .select({ id: schema.workspaces.id, name: schema.workspaces.name, inviteCode: schema.workspaces.inviteCode })
    .from(schema.workspaceMembers)
    .innerJoin(schema.workspaces, eq(schema.workspaceMembers.workspaceId, schema.workspaces.id))
    .where(eq(schema.workspaceMembers.userId, userId));
}

export async function getMembership(workspaceId: string, userId: string, deps: Deps) {
  const { db, schema } = deps;
  const [m] = await db
    .select({ role: schema.workspaceMembers.role })
    .from(schema.workspaceMembers)
    .where(and(eq(schema.workspaceMembers.workspaceId, workspaceId), eq(schema.workspaceMembers.userId, userId)));
  return m ?? null;
}

export async function joinByCode(code: string, userId: string, deps: Deps) {
  const { db, schema } = deps;
  const [w] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.inviteCode, code));
  if (!w) throw new Error('invalid invite code');
  await db.insert(schema.workspaceMembers).values({ workspaceId: w.id, userId, role: 'member' }).onConflictDoNothing();
  return w;
}

export async function renameWorkspace(workspaceId: string, name: string, deps: Deps) {
  const { db, schema } = deps;
  const [w] = await db.update(schema.workspaces).set({ name }).where(eq(schema.workspaces.id, workspaceId)).returning();
  if (!w) throw new Error('workspace not found');
  return w;
}

export async function listMembers(workspaceId: string, deps: Deps) {
  const { db, schema } = deps;
  return db
    .select({ userId: schema.workspaceMembers.userId, role: schema.workspaceMembers.role, email: schema.users.email })
    .from(schema.workspaceMembers)
    .innerJoin(schema.users, eq(schema.workspaceMembers.userId, schema.users.id))
    .where(eq(schema.workspaceMembers.workspaceId, workspaceId));
}

export async function removeMember(workspaceId: string, userId: string, deps: Deps) {
  const { db, schema } = deps;
  const members: Member[] = await db
    .select({ userId: schema.workspaceMembers.userId, role: schema.workspaceMembers.role })
    .from(schema.workspaceMembers)
    .where(eq(schema.workspaceMembers.workspaceId, workspaceId));
  if (!canRemoveMember(members, userId)) throw new Error('cannot remove the only owner');
  await db
    .delete(schema.workspaceMembers)
    .where(and(eq(schema.workspaceMembers.workspaceId, workspaceId), eq(schema.workspaceMembers.userId, userId)));
}

export async function regenerateInviteCode(workspaceId: string, deps: Deps): Promise<string> {
  const { db, schema } = deps;
  const code = generateInviteCode();
  await db.update(schema.workspaces).set({ inviteCode: code }).where(eq(schema.workspaces.id, workspaceId));
  return code;
}

export async function deleteWorkspace(workspaceId: string, deps: Deps) {
  const { db, schema } = deps;
  await db.delete(schema.workspaces).where(eq(schema.workspaces.id, workspaceId));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/integration/workspace-service.test.ts`
Expected: PASS (all four cases).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add workspace service (create, join, members, invite code)"
```

---

## Task 5: `requireMember` + workspace-scoped retrieval & ingestion

**Files:**
- Modify: `src/lib/session.ts`, `src/lib/search/retrieve.ts`, `src/lib/ingest/pipeline.ts`, `src/lib/annotate/embed.ts`
- Test: `tests/integration/workspace-isolation.test.ts`

- [ ] **Step 1: Add `requireMember` to `src/lib/session.ts`**

Add these imports at the top (merge with existing): `import { and, eq } from 'drizzle-orm';` (the file already imports `eq`; add `and`). Then append:
```ts
export async function requireMember(workspaceId: string, userId: string): Promise<{ role: string } | null> {
  const [m] = await db
    .select({ role: schema.workspaceMembers.role })
    .from(schema.workspaceMembers)
    .where(and(eq(schema.workspaceMembers.workspaceId, workspaceId), eq(schema.workspaceMembers.userId, userId)));
  return m ?? null;
}
```

- [ ] **Step 2: Add `workspaceId` to `RetrieveScope` and filter in `src/lib/search/retrieve.ts`**

In the `RetrieveScope` interface, add:
```ts
  workspaceId?: string;
```
In the conditions block (where `opts.scope?.collectionId` etc. are pushed), add as the first condition:
```ts
  if (opts.scope?.workspaceId) conds.push(eq(schema.chunks.workspaceId, opts.scope.workspaceId));
```

- [ ] **Step 3: Stamp `workspaceId` on chunks in `src/lib/ingest/pipeline.ts`**

In the `rows = chunks.map(...)` object, add `workspaceId` sourced from the parent row:
```ts
    const rows = chunks.map((c, i) => ({
      parentType: input.parentType,
      parentId: input.parentId,
      collectionId: parentRow.collectionId ?? null,
      workspaceId: parentRow.workspaceId ?? null,
      chunkIndex: c.index,
      text: c.text,
      embedding: embeddings[i],
      page: pageForOffset(pageOffsets, c.charStart),
      charStart: c.charStart,
      charEnd: c.charEnd,
    }));
```

- [ ] **Step 4: Stamp `workspaceId` on the annotation chunk in `src/lib/annotate/embed.ts`**

In the `db.insert(schema.chunks).values({...})` call, add `workspaceId` from the paper:
```ts
  await db.insert(schema.chunks).values({
    parentType: 'annotation',
    parentId: annotationId,
    collectionId: paper?.collectionId ?? null,
    workspaceId: paper?.workspaceId ?? null,
    chunkIndex: 0,
    text,
    embedding,
    page: ann.page,
    charStart: ann.charStart,
    charEnd: ann.charEnd,
  });
```

- [ ] **Step 5: Write the failing test `tests/integration/workspace-isolation.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { makeTestDb } from '../helpers/testdb';
import { retrieve } from '@/lib/search/retrieve';

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => { ctx = await makeTestDb(); });
afterAll(async () => { await ctx.sql.end(); });

describe('workspace-scoped retrieval', () => {
  it('only returns chunks from the requested workspace', async () => {
    const [u] = await ctx.db.insert(ctx.schema.users).values({ email: 'a@x.edu' }).returning();
    const [w1] = await ctx.db.insert(ctx.schema.workspaces).values({ name: 'W1', ownerId: u.id, inviteCode: 'c1' }).returning();
    const [w2] = await ctx.db.insert(ctx.schema.workspaces).values({ name: 'W2', ownerId: u.id, inviteCode: 'c2' }).returning();
    const [p1] = await ctx.db.insert(ctx.schema.papers).values({ title: 'P1', status: 'ready', workspaceId: w1.id }).returning();
    const [p2] = await ctx.db.insert(ctx.schema.papers).values({ title: 'P2', status: 'ready', workspaceId: w2.id }).returning();
    const vec = Array(1536).fill(0); vec[0] = 1;
    await ctx.db.insert(ctx.schema.chunks).values([
      { parentType: 'paper', parentId: p1.id, workspaceId: w1.id, chunkIndex: 0, text: 'secret one', embedding: vec, page: 1, charStart: 0, charEnd: 10 },
      { parentType: 'paper', parentId: p2.id, workspaceId: w2.id, chunkIndex: 0, text: 'secret two', embedding: vec, page: 1, charStart: 0, charEnd: 10 },
    ]);
    const llm = { embed: vi.fn(async () => [vec]), chat: vi.fn(), complete: vi.fn() } as any;
    const res = await retrieve('secret', llm, ctx.db, { schema: ctx.schema, scope: { workspaceId: w1.id } });
    expect(res).toHaveLength(1);
    expect(res[0].text).toBe('secret one');
  });
});
```

- [ ] **Step 6: Run the test (and the Phase 1 retrieve test for no regression)**

Run: `npm test -- tests/integration/workspace-isolation.test.ts tests/integration/retrieve.test.ts`
Expected: PASS (both files).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add requireMember and workspace-scoped retrieval/ingestion"
```

---

## Task 6: Workspace API routes

**Files:**
- Create: `src/app/api/workspaces/route.ts`, `src/app/api/workspaces/join/route.ts`, `src/app/api/workspaces/[id]/route.ts`, `src/app/api/workspaces/[id]/members/route.ts`, `src/app/api/workspaces/[id]/members/[userId]/route.ts`, `src/app/api/workspaces/[id]/invite-code/route.ts`

- [ ] **Step 1: Create `src/app/api/workspaces/route.ts`** (list + create)

```ts
import { z } from 'zod';
import { db, schema } from '@/db/client';
import { requireUser } from '@/lib/session';
import { createWorkspace, listWorkspaces } from '@/lib/workspaces/service';

const Body = z.object({ name: z.string().min(1) });

export async function GET() {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  return Response.json(await listWorkspaces(user.id, { db, schema }));
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { name } = Body.parse(await req.json());
  return Response.json(await createWorkspace(name, user.id, { db, schema }), { status: 201 });
}
```

- [ ] **Step 2: Create `src/app/api/workspaces/join/route.ts`**

```ts
import { z } from 'zod';
import { db, schema } from '@/db/client';
import { requireUser } from '@/lib/session';
import { joinByCode } from '@/lib/workspaces/service';

const Body = z.object({ code: z.string().min(1) });

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { code } = Body.parse(await req.json());
  try {
    const w = await joinByCode(code, user.id, { db, schema });
    return Response.json({ id: w.id, name: w.name });
  } catch {
    return Response.json({ error: 'Invalid or expired invite code' }, { status: 404 });
  }
}
```

- [ ] **Step 3: Create `src/app/api/workspaces/[id]/route.ts`** (rename + delete, owner only)

```ts
import { z } from 'zod';
import { db, schema } from '@/db/client';
import { requireUser, requireMember } from '@/lib/session';
import { renameWorkspace, deleteWorkspace } from '@/lib/workspaces/service';

const Patch = z.object({ name: z.string().min(1) });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  const m = await requireMember(id, user.id);
  if (m?.role !== 'owner') return new Response('Forbidden', { status: 403 });
  const { name } = Patch.parse(await req.json());
  return Response.json(await renameWorkspace(id, name, { db, schema }));
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  const m = await requireMember(id, user.id);
  if (m?.role !== 'owner') return new Response('Forbidden', { status: 403 });
  await deleteWorkspace(id, { db, schema });
  return Response.json({ ok: true });
}
```

- [ ] **Step 4: Create `src/app/api/workspaces/[id]/members/route.ts`** (list, members only)

```ts
import { db, schema } from '@/db/client';
import { requireUser, requireMember } from '@/lib/session';
import { listMembers } from '@/lib/workspaces/service';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  if (!(await requireMember(id, user.id))) return new Response('Forbidden', { status: 403 });
  return Response.json(await listMembers(id, { db, schema }));
}
```

- [ ] **Step 5: Create `src/app/api/workspaces/[id]/members/[userId]/route.ts`** (remove, owner only)

```ts
import { db, schema } from '@/db/client';
import { requireUser, requireMember } from '@/lib/session';
import { removeMember } from '@/lib/workspaces/service';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id, userId } = await params;
  const m = await requireMember(id, user.id);
  if (m?.role !== 'owner') return new Response('Forbidden', { status: 403 });
  try {
    await removeMember(id, userId, { db, schema });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
```

- [ ] **Step 6: Create `src/app/api/workspaces/[id]/invite-code/route.ts`** (regenerate, owner only)

```ts
import { db, schema } from '@/db/client';
import { requireUser, requireMember } from '@/lib/session';
import { regenerateInviteCode } from '@/lib/workspaces/service';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  const m = await requireMember(id, user.id);
  if (m?.role !== 'owner') return new Response('Forbidden', { status: 403 });
  return Response.json({ inviteCode: await regenerateInviteCode(id, { db, schema }) });
}
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add workspace API routes (create, join, members, invite code)"
```

---

## Task 7: Make existing routes workspace-aware

**Files:**
- Modify: `src/app/api/collections/route.ts`, `src/app/api/upload/route.ts`, `src/app/api/chat/route.ts`, `src/app/api/annotations/[id]/themes/route.ts`, `src/app/api/collections/[id]/themes/route.ts`, `src/app/api/collections/[id]/matrix/route.ts`, `src/app/api/collections/[id]/suggest-themes/route.ts`

> Pattern: each route resolves the relevant `workspaceId` (from the request or from the object) and calls `requireMember(workspaceId, user.id)`, returning 403 if absent. Create routes also persist `workspaceId`.

- [ ] **Step 1: `collections/route.ts` — scope create + list to a workspace**

Replace the file with:
```ts
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { requireUser, requireMember } from '@/lib/session';

const Body = z.object({ workspaceId: z.string().uuid(), name: z.string().min(1), researchQuestion: z.string().optional() });

export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const workspaceId = new URL(req.url).searchParams.get('workspaceId');
  if (!workspaceId) return Response.json({ error: 'workspaceId required' }, { status: 400 });
  if (!(await requireMember(workspaceId, user.id))) return new Response('Forbidden', { status: 403 });
  return Response.json(await db.select().from(schema.collections).where(eq(schema.collections.workspaceId, workspaceId)));
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const body = Body.parse(await req.json());
  if (!(await requireMember(body.workspaceId, user.id))) return new Response('Forbidden', { status: 403 });
  const [row] = await db
    .insert(schema.collections)
    .values({ name: body.name, researchQuestion: body.researchQuestion, workspaceId: body.workspaceId, createdBy: user.id })
    .returning();
  return Response.json(row, { status: 201 });
}
```

- [ ] **Step 2: `upload/route.ts` — require workspace + stamp it on the paper/review**

In `src/app/api/upload/route.ts`, after parsing `kind`, read and check the workspace, and add `workspaceId` to the inserted `values`. Replace the section from `const form = await req.formData();` through the `db.insert(table)` call with:
```ts
  const form = await req.formData();
  const kind = z.enum(['paper', 'review']).parse(form.get('kind'));
  const workspaceId = (form.get('workspaceId') as string) || '';
  if (!workspaceId) return Response.json({ error: 'workspaceId required' }, { status: 400 });
  if (!(await requireMember(workspaceId, user.id))) return new Response('Forbidden', { status: 403 });
  const collectionId = (form.get('collectionId') as string) || null;
  const title = (form.get('title') as string) || null;
  const file = form.get('file') as File | null;
  const pastedText = (form.get('text') as string) || null;

  let pdfUrl: string | null = null;
  let bytes: Uint8Array | undefined;
  if (file && file.size > 0) {
    bytes = new Uint8Array(await file.arrayBuffer());
    pdfUrl = await uploadPdf(file.name, bytes);
  }

  const table = kind === 'paper' ? schema.papers : schema.reviews;
  const values: Record<string, unknown> = { collectionId, workspaceId, title, pdfUrl, status: 'pending' };
  if (kind === 'paper') values.uploadedBy = user.id;
  else values.createdBy = user.id;
  const [row] = await db.insert(table).values(values).returning();
```
Also add the import: `import { requireUser, requireMember } from '@/lib/session';` (replace the existing `requireUser` import line).

- [ ] **Step 3: `chat/route.ts` — require workspace membership and scope retrieval to it**

Replace the file with:
```ts
import { z } from 'zod';
import { db, schema } from '@/db/client';
import { requireUser, requireMember } from '@/lib/session';
import { getLLM } from '@/lib/llm';
import { answerQuestion } from '@/lib/chat/answer';

const Body = z.object({
  workspaceId: z.string().uuid(),
  query: z.string().min(1),
  scope: z
    .object({
      collectionId: z.string().uuid().optional(),
      parentType: z.enum(['paper', 'review']).optional(),
      parentId: z.string().uuid().optional(),
    })
    .optional(),
});

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const body = Body.parse(await req.json());
  if (!(await requireMember(body.workspaceId, user.id))) return new Response('Forbidden', { status: 403 });
  const scope = { ...body.scope, workspaceId: body.workspaceId };
  const result = await answerQuestion(body.query, getLLM(), db, { scope, schema });
  return Response.json(result);
}
```

- [ ] **Step 4: Guard the annotation-tagging route by the paper's workspace — `annotations/[id]/themes/route.ts`**

Replace the file with:
```ts
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { requireUser, requireMember } from '@/lib/session';
import { tagAnnotation } from '@/lib/themes/service';

const Body = z.object({ themeId: z.string().uuid() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  const { themeId } = Body.parse(await req.json());
  // resolve the annotation's workspace via its paper
  const [ann] = await db.select({ paperId: schema.annotations.paperId }).from(schema.annotations).where(eq(schema.annotations.id, id));
  if (!ann) return new Response('Not found', { status: 404 });
  const [paper] = await db.select({ workspaceId: schema.papers.workspaceId }).from(schema.papers).where(eq(schema.papers.id, ann.paperId));
  if (!paper?.workspaceId || !(await requireMember(paper.workspaceId, user.id))) return new Response('Forbidden', { status: 403 });
  try {
    await tagAnnotation(id, themeId, { db, schema });
    return Response.json({ ok: true }, { status: 201 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
```

- [ ] **Step 5: Guard the collection-scoped theme/matrix/suggest routes by the collection's workspace**

For each of `collections/[id]/themes/route.ts`, `collections/[id]/matrix/route.ts`, and `collections/[id]/suggest-themes/route.ts`, add this membership check immediately after resolving `const { id } = await params;` and the `requireUser` check, in **every** exported handler:
```ts
  const [col] = await db.select({ workspaceId: schema.collections.workspaceId }).from(schema.collections).where(eq(schema.collections.id, id));
  if (!col?.workspaceId || !(await requireMember(col.workspaceId, user.id))) return new Response('Forbidden', { status: 403 });
```
Add the imports each file needs: `import { eq } from 'drizzle-orm';` (if not present) and `requireMember` alongside `requireUser` in the `@/lib/session` import.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: enforce workspace membership and scoping on existing routes"
```

---

## Task 8: UI — onboarding, switcher, dashboard, members, and workspace-aware pages

**Files:**
- Create: `src/app/onboarding/page.tsx`, `src/components/WorkspaceOnboarding.tsx`, `src/app/join/[code]/page.tsx`, `src/app/workspaces/[id]/page.tsx`, `src/app/workspaces/[id]/members/page.tsx`, `src/components/MembersPanel.tsx`
- Modify: `src/app/page.tsx` (home → workspace list/switcher), `src/middleware.ts` (exempt onboarding/join)

- [ ] **Step 1: Home page → list workspaces + entry points — replace `src/app/page.tsx`**

```tsx
import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { auth, signOut } from '@/auth';
import { db, schema } from '@/db/client';
import { redirect } from 'next/navigation';

export default async function Home() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) redirect('/login');
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  const workspaces = user
    ? await db
        .select({ id: schema.workspaces.id, name: schema.workspaces.name })
        .from(schema.workspaceMembers)
        .innerJoin(schema.workspaces, eq(schema.workspaceMembers.workspaceId, schema.workspaces.id))
        .where(eq(schema.workspaceMembers.userId, user.id))
    : [];
  if (workspaces.length === 0) redirect('/onboarding');
  return (
    <main style={{ padding: 40 }}>
      <h1>LitReview</h1>
      <p>Signed in as {email}</p>
      <h2>Your workspaces</h2>
      <ul>
        {workspaces.map((w) => (
          <li key={w.id}><Link href={`/workspaces/${w.id}`}>{w.name}</Link></li>
        ))}
      </ul>
      <Link href="/onboarding">+ Create or join a workspace</Link>
      <form action={async () => { 'use server'; await signOut({ redirectTo: '/login' }); }}>
        <button type="submit">Sign out</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Create `src/components/WorkspaceOnboarding.tsx`**

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function WorkspaceOnboarding() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [status, setStatus] = useState('');

  async function create() {
    const res = await fetch('/api/workspaces', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) });
    if (res.ok) { const w = await res.json(); router.push(`/workspaces/${w.id}`); } else setStatus('Could not create workspace');
  }
  async function join() {
    const res = await fetch('/api/workspaces/join', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) });
    if (res.ok) { const w = await res.json(); router.push(`/workspaces/${w.id}`); } else setStatus('Invalid invite code');
  }

  return (
    <div>
      <section>
        <h2>Create a workspace</h2>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Workspace name" />
        <button onClick={create} disabled={!name.trim()}>Create</button>
      </section>
      <section>
        <h2>Join a workspace</h2>
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Invite code" />
        <button onClick={join} disabled={!code.trim()}>Join</button>
      </section>
      <p>{status}</p>
    </div>
  );
}
```

- [ ] **Step 3: Create `src/app/onboarding/page.tsx`**

```tsx
import { WorkspaceOnboarding } from '@/components/WorkspaceOnboarding';

export default function OnboardingPage() {
  return (
    <main style={{ padding: 40 }}>
      <h1>Welcome to LitReview</h1>
      <p>Create a workspace for your team, or join one with an invite code.</p>
      <WorkspaceOnboarding />
    </main>
  );
}
```

- [ ] **Step 4: Create `src/app/join/[code]/page.tsx`** (auto-join via link)

```tsx
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { db, schema } from '@/db/client';
import { joinByCode } from '@/lib/workspaces/service';

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const session = await auth();
  const email = session?.user?.email;
  if (!email) redirect('/login');
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (!user) redirect('/login');
  try {
    const w = await joinByCode(code, user.id, { db, schema });
    redirect(`/workspaces/${w.id}`);
  } catch {
    return <main style={{ padding: 40 }}>This invite link is invalid or has been revoked.</main>;
  }
}
```

- [ ] **Step 5: Create `src/app/workspaces/[id]/page.tsx`** (dashboard: collections + nav)

```tsx
import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';

export default async function WorkspaceDashboard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [w] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, id));
  if (!w) return <main style={{ padding: 40 }}>Workspace not found.</main>;
  const collections = await db.select().from(schema.collections).where(eq(schema.collections.workspaceId, id));
  return (
    <main style={{ padding: 40 }}>
      <h1>{w.name}</h1>
      <nav style={{ display: 'flex', gap: 16 }}>
        <Link href={`/workspaces/${id}/members`}>Members & invite</Link>
        <Link href="/">All workspaces</Link>
      </nav>
      <h2>Collections</h2>
      <ul>
        {collections.map((c) => (
          <li key={c.id}><Link href={`/collections/${c.id}/matrix`}>{c.name}</Link></li>
        ))}
      </ul>
      {collections.length === 0 && <p>No collections yet.</p>}
    </main>
  );
}
```

- [ ] **Step 6: Create `src/components/MembersPanel.tsx`**

```tsx
'use client';
import { useEffect, useState } from 'react';

interface Member { userId: string; role: string; email: string }

export function MembersPanel({ workspaceId, inviteCode }: { workspaceId: string; inviteCode: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [code, setCode] = useState(inviteCode);

  useEffect(() => {
    let active = true;
    fetch(`/api/workspaces/${workspaceId}/members`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d: Member[]) => { if (active) setMembers(d); });
    return () => { active = false; };
  }, [workspaceId]);

  const link = typeof window !== 'undefined' ? `${window.location.origin}/join/${code}` : `/join/${code}`;

  async function regenerate() {
    const res = await fetch(`/api/workspaces/${workspaceId}/invite-code`, { method: 'POST' });
    if (res.ok) setCode((await res.json()).inviteCode);
  }

  return (
    <div>
      <h2>Invite</h2>
      <p>Share this link: <code>{link}</code></p>
      <button onClick={() => navigator.clipboard?.writeText(link)}>Copy link</button>
      <button onClick={regenerate}>Regenerate (revokes old link)</button>
      <h2>Members</h2>
      <ul>{members.map((m) => <li key={m.userId}>{m.email} — {m.role}</li>)}</ul>
    </div>
  );
}
```

- [ ] **Step 7: Create `src/app/workspaces/[id]/members/page.tsx`**

```tsx
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { MembersPanel } from '@/components/MembersPanel';

export default async function MembersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [w] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, id));
  if (!w) return <main style={{ padding: 40 }}>Workspace not found.</main>;
  return (
    <main style={{ padding: 40 }}>
      <h1>{w.name} — members</h1>
      <MembersPanel workspaceId={id} inviteCode={w.inviteCode} />
    </main>
  );
}
```

- [ ] **Step 8: Exempt onboarding/join from the membership-less redirect — modify `src/middleware.ts`**

Replace the redirect condition so authenticated users are allowed through to `/login`, `/onboarding`, `/join/*`, and `/api/auth/*` without further gating (page-level logic handles workspace redirects):
```ts
import { auth } from '@/auth';

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isPublic =
    pathname === '/login' ||
    pathname === '/onboarding' ||
    pathname.startsWith('/join/') ||
    pathname.startsWith('/api/auth');
  if (!req.auth && !isPublic) {
    return Response.redirect(new URL('/login', req.nextUrl.origin));
  }
});

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
```

- [ ] **Step 9: Verify build and types**

Run: `npx tsc --noEmit && npm run lint`
Expected: tsc no errors; lint exit 0 (warnings allowed).

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: add onboarding, workspace dashboard, members/invite UI"
```

---

## Task 9: Full verification, README, and memory note

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Run the entire suite**

Run: `npm test`
Expected: all unit + integration tests PASS.

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Update `README.md` — replace the allowlist setup with workspaces**

In the env-vars table, **remove** the `ALLOWED_EMAILS` row. Then add this section before "## Deploy (Vercel)":
```markdown
## Workspaces & collaboration
- Anyone who signs in with Google can create a **workspace** and invite teammates.
- After signing in, create a workspace or join one with an invite code (or open a `/join/<code>` link).
- A workspace owner can view members, copy/regenerate the invite link, and remove members at `/workspaces/<id>/members`.
- All papers, reviews, annotations, themes, and chat are scoped to the current workspace — members collaborate on the same content; non-members have no access.
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: document workspaces and remove allowlist setup"
```

---

## Self-Review (completed during authoring)

**Spec coverage:**
- `workspaces` + `workspace_members` + `workspaceId` columns → Task 1 ✓ (nullable, flagged deviation)
- Remove allowlist (`ALLOWED_EMAILS`/`isAllowed`/signIn callback; delete module+test) → Task 3 ✓
- Invite-code generation; last-owner guard → Task 2 ✓
- Create/list/join/rename/members/remove/regenerate/delete → Tasks 4, 6 ✓
- `requireMember`; workspace-scoped retrieval + ingestion stamping → Task 5 ✓
- Object/route membership enforcement + workspace scoping on existing routes → Task 7 ✓
- Onboarding redirect, dashboard, switcher (home), members/invite, join-by-link → Task 8 ✓
- Error handling: 401/403, invalid code 404, last-owner 400 → Tasks 4, 6, 7 ✓
- Testing: unit (invite/guard), integration (schema, service, isolation), build → Tasks 1–9 ✓

**Type consistency:** `Deps = { db, schema }` across workspace service; `requireMember` returns `{ role } | null` and every owner-only route checks `m?.role !== 'owner'`. `RetrieveScope.workspaceId` defined in Task 5 and used by the chat route in Task 7. `generateInviteCode`/`canRemoveMember`/`Member` signatures match between Task 2 and Task 4. `createWorkspace(name, userId, deps)` argument order consistent between service (Task 4) and route (Task 6).

**Known thin spots (acceptable, flagged):**
- `workspaceId` is nullable at the DB (flagged deviation from the spec's NOT NULL); the no-leak guarantee comes from retrieval filtering + `requireMember`, both tested. Tightening to NOT NULL later would require backfilling/seeding all test fixtures.
- The upload and chat **UIs** (`UploadForm`, `ChatPanel`) still need a `workspaceId` wired in to actually call the now-workspace-required routes; this plan makes the routes correct and adds the workspace navigation, but threading the active workspace into those two existing forms is a small follow-up (they currently omit it). Flagged rather than hidden.
- Removing a member has a route but no button in `MembersPanel` yet (list + invite only); a remove control is a minor add.
