# Phase 3a — Conversational Chat Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make chat persistent and windowed — private per-user chats with history, resume, bounded conversational memory, a pinned composer, and a scrollable message pane (fixes BUG-7/BUG-8).

**Architecture:** Two new Drizzle tables (`chats`, `chatMessages`), a DI'd sessions service (`src/lib/chat/sessions.ts`), `answerQuestion` extended with bounded history, REST routes under `/api/chats`, and a two-pane `ChatPanel` (history rail + conversation pane) wired to those routes. The stateless `/api/chat` route is removed; the `answerQuestion` function is reused.

**Tech Stack:** Next.js App Router, Drizzle ORM + Postgres (Neon), Vitest (unit + integration against the Neon test DB), class-based CSS in `src/app/styles/screens.css`.

Spec: `docs/superpowers/specs/2026-06-04-phase3a-chat-sessions-design.md`

## File map

- `src/db/schema.ts` — add `chats`, `chatMessages` (modify)
- `drizzle/0005_*.sql` + `drizzle/meta/*` — generated migration (new, via `npm run db:gen`)
- `src/lib/chat/title.ts` — `titleFromQuestion` (new, pure)
- `src/lib/chat/sessions.ts` — sessions service (new)
- `src/lib/chat/answer.ts` — add `history` (modify)
- `src/app/api/chats/route.ts` — POST create, GET list (new)
- `src/app/api/chats/[id]/route.ts` — GET, DELETE (new)
- `src/app/api/chats/[id]/messages/route.ts` — POST a turn (new)
- `src/app/api/chat/route.ts` — DELETE the file (remove old stateless route)
- `src/app/workspaces/[id]/(app)/chat/page.tsx` — fetch chat list, pass to ChatPanel (modify)
- `src/components/ChatHistoryRail.tsx` — history rail (new)
- `src/components/ChatPanel.tsx` — two-pane restructure + persistence (rewrite)
- `src/app/styles/screens.css` — windowed layout + spacing + rail (modify)
- Tests: `tests/unit/chat-title.test.ts`, `tests/integration/chat-sessions.test.ts`, `tests/integration/chat-history.test.ts`

---

### Task 1: Schema + migration (`chats`, `chatMessages`)

**Files:**
- Modify: `src/db/schema.ts`
- Create (generated): `drizzle/0005_*.sql`, `drizzle/meta/*`

- [ ] **Step 1: Add the tables to `src/db/schema.ts`**

Append after the `workspaceMembers` table (end of file). Follow existing conventions exactly:

```ts
export const chats = pgTable('chats', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  scopeKind: text('scope_kind', { enum: ['workspace', 'collection', 'paper'] }).notNull().default('workspace'),
  scopeId: uuid('scope_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const chatMessages = pgTable('chat_messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  chatId: uuid('chat_id').notNull().references(() => chats.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['user', 'assistant'] }).notNull(),
  content: text('content').notNull(),
  citations: jsonb('citations'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

- [ ] **Step 2: Generate the migration**

Run: `npm run db:gen`
Expected: a new `drizzle/0005_*.sql` is created containing `CREATE TABLE "chats" (...)` and `CREATE TABLE "chat_messages" (...)` with the two FKs (`chats.workspace_id`, `chats.user_id`) and `chat_messages.chat_id` cascade. Open the file and confirm it only adds these two tables (no unexpected drops).

- [ ] **Step 3: Apply the migration to the dev DB**

Run: `npm run db:migrate`
Expected: applies cleanly (the test DB is reset+migrated automatically by `makeTestDb`, so no separate step there).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors in `src/` (the ~23 pre-existing `tests/ui/*` errors are unrelated).

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts drizzle/
git commit -m "feat(chat): add chats and chatMessages tables"
```

---

### Task 2: `titleFromQuestion` helper (TDD)

**Files:**
- Create: `src/lib/chat/title.ts`
- Test: `tests/unit/chat-title.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/chat-title.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { titleFromQuestion } from '@/lib/chat/title';

describe('titleFromQuestion', () => {
  it('returns "New chat" for empty/whitespace input', () => {
    expect(titleFromQuestion('')).toBe('New chat');
    expect(titleFromQuestion('   ')).toBe('New chat');
  });
  it('collapses whitespace and keeps short questions whole', () => {
    expect(titleFromQuestion('  What   are the   findings? ')).toBe('What are the findings?');
  });
  it('truncates long questions on a word boundary with an ellipsis', () => {
    const long = 'What are the most important methodological differences between these twelve studies on attention';
    const out = titleFromQuestion(long);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(61); // <=60 chars + ellipsis
    expect(out.startsWith('What are the most')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/chat-title.test.ts`
Expected: FAIL — "Cannot find module '@/lib/chat/title'".

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/chat/title.ts`:

```ts
// Derives a chat title from its first question — trimmed, whitespace-collapsed, and
// truncated to <=60 chars on a word boundary (with an ellipsis). Empty → "New chat".
export function titleFromQuestion(q: string): string {
  const clean = q.trim().replace(/\s+/g, ' ');
  if (!clean) return 'New chat';
  if (clean.length <= 60) return clean;
  const cut = clean.slice(0, 60);
  const lastSpace = cut.lastIndexOf(' ');
  const base = lastSpace > 30 ? cut.slice(0, lastSpace) : cut;
  return base + '…';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/chat-title.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/chat/title.ts tests/unit/chat-title.test.ts
git commit -m "feat(chat): add titleFromQuestion helper"
```

---

### Task 3: Sessions service (TDD, integration against test DB)

**Files:**
- Create: `src/lib/chat/sessions.ts`
- Test: `tests/integration/chat-sessions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/integration/chat-sessions.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from '../helpers/testdb';
import {
  createChat, listChats, getChat, listMessages, addMessage, setChatTitle, deleteChat,
} from '@/lib/chat/sessions';

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => { ctx = await makeTestDb(); });
afterAll(async () => { await ctx.sql.end(); });

function deps() { return { db: ctx.db, schema: ctx.schema }; }

async function seedUserWorkspace() {
  const [u] = await ctx.db.insert(ctx.schema.users).values({ email: `u${Math.random()}@x.io` }).returning();
  const [w] = await ctx.db.insert(ctx.schema.workspaces).values({ name: 'W', inviteCode: `c${Math.random()}` }).returning();
  return { userId: u.id, workspaceId: w.id };
}

describe('chat sessions service', () => {
  it('creates a chat and lists it for its owner only', async () => {
    const a = await seedUserWorkspace();
    const b = await seedUserWorkspace();
    const chat = await createChat({ workspaceId: a.workspaceId, userId: a.userId, title: 'New chat' }, deps());
    expect(chat.scopeKind).toBe('workspace');

    const mine = await listChats(a.workspaceId, a.userId, deps());
    expect(mine.map((c: any) => c.id)).toContain(chat.id);

    // Another user in (conceptually) the same place cannot see A's chat.
    const theirs = await listChats(a.workspaceId, b.userId, deps());
    expect(theirs.map((c: any) => c.id)).not.toContain(chat.id);
  });

  it('adds messages in order and bumps updatedAt so listChats re-sorts by recency', async () => {
    const a = await seedUserWorkspace();
    const older = await createChat({ workspaceId: a.workspaceId, userId: a.userId, title: 'older' }, deps());
    const newer = await createChat({ workspaceId: a.workspaceId, userId: a.userId, title: 'newer' }, deps());
    // Touch `older` last → it should sort first.
    await addMessage({ chatId: older.id, role: 'user', content: 'hello' }, deps());
    await addMessage({ chatId: older.id, role: 'assistant', content: 'hi there', citations: [] }, deps());

    const msgs = await listMessages(older.id, deps());
    expect(msgs.map((m: any) => m.role)).toEqual(['user', 'assistant']);

    const list = await listChats(a.workspaceId, a.userId, deps());
    const ids = list.map((c: any) => c.id);
    expect(ids.indexOf(older.id)).toBeLessThan(ids.indexOf(newer.id));
  });

  it('sets the title, and delete cascades to messages', async () => {
    const a = await seedUserWorkspace();
    const chat = await createChat({ workspaceId: a.workspaceId, userId: a.userId, title: 'New chat' }, deps());
    await setChatTitle(chat.id, 'A real title', deps());
    expect((await getChat(chat.id, deps())).title).toBe('A real title');

    await addMessage({ chatId: chat.id, role: 'user', content: 'q' }, deps());
    await deleteChat(chat.id, deps());
    expect(await getChat(chat.id, deps())).toBeUndefined();
    const orphans = await ctx.db.select().from(ctx.schema.chatMessages).where(eq(ctx.schema.chatMessages.chatId, chat.id));
    expect(orphans).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/chat-sessions.test.ts`
Expected: FAIL — "Cannot find module '@/lib/chat/sessions'".

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/chat/sessions.ts`:

```ts
import { and, asc, desc, eq } from 'drizzle-orm';

interface Deps {
  db: any;
  schema: any;
}

type ScopeKind = 'workspace' | 'collection' | 'paper';

export async function createChat(
  input: { workspaceId: string; userId: string; title: string; scopeKind?: ScopeKind; scopeId?: string | null },
  deps: Deps,
) {
  const { db, schema } = deps;
  const [row] = await db
    .insert(schema.chats)
    .values({
      workspaceId: input.workspaceId,
      userId: input.userId,
      title: input.title,
      scopeKind: input.scopeKind ?? 'workspace',
      scopeId: input.scopeId ?? null,
    })
    .returning();
  return row;
}

export async function listChats(workspaceId: string, userId: string, deps: Deps) {
  const { db, schema } = deps;
  return db
    .select()
    .from(schema.chats)
    .where(and(eq(schema.chats.workspaceId, workspaceId), eq(schema.chats.userId, userId)))
    .orderBy(desc(schema.chats.updatedAt));
}

export async function getChat(chatId: string, deps: Deps) {
  const { db, schema } = deps;
  const [row] = await db.select().from(schema.chats).where(eq(schema.chats.id, chatId));
  return row;
}

export async function listMessages(chatId: string, deps: Deps) {
  const { db, schema } = deps;
  return db
    .select()
    .from(schema.chatMessages)
    .where(eq(schema.chatMessages.chatId, chatId))
    .orderBy(asc(schema.chatMessages.createdAt));
}

export async function addMessage(
  input: { chatId: string; role: 'user' | 'assistant'; content: string; citations?: unknown },
  deps: Deps,
) {
  const { db, schema } = deps;
  const [row] = await db
    .insert(schema.chatMessages)
    .values({ chatId: input.chatId, role: input.role, content: input.content, citations: input.citations ?? null })
    .returning();
  await db.update(schema.chats).set({ updatedAt: new Date() }).where(eq(schema.chats.id, input.chatId));
  return row;
}

export async function setChatTitle(chatId: string, title: string, deps: Deps) {
  const { db, schema } = deps;
  await db.update(schema.chats).set({ title }).where(eq(schema.chats.id, chatId));
}

export async function deleteChat(chatId: string, deps: Deps) {
  const { db, schema } = deps;
  await db.delete(schema.chats).where(eq(schema.chats.id, chatId));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/integration/chat-sessions.test.ts`
Expected: PASS (3 tests). Note: messages are ordered by `created_at`; the two inserts in test 2 are separate statements so their timestamps differ.

- [ ] **Step 5: Commit**

```bash
git add src/lib/chat/sessions.ts tests/integration/chat-sessions.test.ts
git commit -m "feat(chat): add chat sessions service"
```

---

### Task 4: Conversational memory in `answerQuestion` (TDD)

**Files:**
- Modify: `src/lib/chat/answer.ts`
- Test: `tests/integration/chat-history.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/integration/chat-history.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { makeTestDb } from '../helpers/testdb';
import { answerQuestion } from '@/lib/chat/answer';
import type { ChatMessage } from '@/lib/llm/types';

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => { ctx = await makeTestDb(); });
afterAll(async () => { await ctx.sql.end(); });

it('prepends prior history to the current question when calling the LLM', async () => {
  // One chunk so retrieval returns context (otherwise answerQuestion early-returns).
  await ctx.db.insert(ctx.schema.chunks).values({
    parentType: 'paper', parentId: crypto.randomUUID(), chunkIndex: 0,
    text: 'Transformers scale well.', embedding: Array(1536).fill(0.01), charStart: 0, charEnd: 24,
  });
  const seen: ChatMessage[][] = [];
  const llm = {
    embed: vi.fn(async (t: string[]) => t.map(() => Array(1536).fill(0.01))),
    chat: vi.fn(async (messages: ChatMessage[]) => { seen.push(messages); return { answer: 'ok', citations: [] }; }),
    complete: vi.fn(),
  } as any;

  const history: ChatMessage[] = [
    { role: 'user', content: 'first q' },
    { role: 'assistant', content: 'first a' },
  ];
  await answerQuestion('follow up', llm, ctx.db, { schema: ctx.schema, history });

  expect(seen[0]).toEqual([
    { role: 'user', content: 'first q' },
    { role: 'assistant', content: 'first a' },
    { role: 'user', content: 'follow up' },
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/chat-history.test.ts`
Expected: FAIL — the current `answerQuestion` ignores history, so `seen[0]` is just `[{ role:'user', content:'follow up' }]`.

- [ ] **Step 3: Write minimal implementation**

Replace the body of `src/lib/chat/answer.ts` with:

```ts
import { retrieve, type RetrieveScope } from '../search/retrieve';
import type { LLMProvider, ChatResult, ChatMessage } from '../llm/types';

export interface AnswerOpts {
  scope?: RetrieveScope;
  k?: number;
  schema: any;
  history?: ChatMessage[]; // prior turns, oldest → newest; caller bounds the length
}

export async function answerQuestion(
  query: string,
  llm: LLMProvider,
  db: any,
  opts: AnswerOpts,
): Promise<ChatResult> {
  const context = await retrieve(query, llm, db, { scope: opts.scope, k: opts.k ?? 8, schema: opts.schema });
  if (context.length === 0) {
    return { answer: 'I could not find this in the corpus.', citations: [] };
  }
  return llm.chat([...(opts.history ?? []), { role: 'user', content: query }], context);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/integration/chat-history.test.ts`
Expected: PASS. Also run `npx vitest run tests/integration/upload-flow.test.ts` to confirm the existing single-turn caller still passes (it calls `answerQuestion` with no history).

- [ ] **Step 5: Commit**

```bash
git add src/lib/chat/answer.ts tests/integration/chat-history.test.ts
git commit -m "feat(chat): thread bounded conversation history into answerQuestion"
```

---

### Task 5: Chat REST routes + remove stateless `/api/chat`

**Files:**
- Create: `src/app/api/chats/route.ts`
- Create: `src/app/api/chats/[id]/route.ts`
- Create: `src/app/api/chats/[id]/messages/route.ts`
- Delete: `src/app/api/chat/route.ts`

These are thin route handlers that import `requireUser` (next-auth) and therefore are not unit-tested in this repo (same boundary as `/api/papers/[id]` etc.); they are verified by `tsc` + `eslint` + `next build`, and they delegate to the already-tested service/answer functions.

- [ ] **Step 1: Create `src/app/api/chats/route.ts`**

```ts
import { z } from 'zod';
import { db, schema } from '@/db/client';
import { requireUser, requireMember } from '@/lib/session';
import { createChat, listChats } from '@/lib/chat/sessions';

const CreateBody = z.object({
  workspaceId: z.string().uuid(),
  scopeKind: z.enum(['workspace', 'collection', 'paper']).optional(),
  scopeId: z.string().uuid().optional(),
});

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const body = CreateBody.parse(await req.json());
  if (!(await requireMember(body.workspaceId, user.id))) return new Response('Forbidden', { status: 403 });
  const chat = await createChat(
    { workspaceId: body.workspaceId, userId: user.id, title: 'New chat', scopeKind: body.scopeKind, scopeId: body.scopeId ?? null },
    { db, schema },
  );
  return Response.json({ id: chat.id }, { status: 201 });
}

export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const workspaceId = new URL(req.url).searchParams.get('workspaceId') ?? '';
  if (!workspaceId) return Response.json({ error: 'workspaceId required' }, { status: 400 });
  if (!(await requireMember(workspaceId, user.id))) return new Response('Forbidden', { status: 403 });
  const chats = await listChats(workspaceId, user.id, { db, schema });
  return Response.json({ chats });
}
```

- [ ] **Step 2: Create `src/app/api/chats/[id]/route.ts`**

```ts
import { db, schema } from '@/db/client';
import { requireUser } from '@/lib/session';
import { getChat, listMessages, deleteChat } from '@/lib/chat/sessions';

async function ownedChat(id: string, userId: string) {
  const chat = await getChat(id, { db, schema });
  if (!chat) return { error: 'Not found', status: 404 as const };
  if (chat.userId !== userId) return { error: 'Forbidden', status: 403 as const };
  return { chat };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  const res = await ownedChat(id, user.id);
  if ('error' in res) return new Response(res.error, { status: res.status });
  const messages = await listMessages(id, { db, schema });
  return Response.json({ chat: res.chat, messages });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  const res = await ownedChat(id, user.id);
  if ('error' in res) return new Response(res.error, { status: res.status });
  await deleteChat(id, { db, schema });
  return new Response(null, { status: 204 });
}
```

- [ ] **Step 3: Create `src/app/api/chats/[id]/messages/route.ts`**

```ts
import { z } from 'zod';
import { db, schema } from '@/db/client';
import { requireUser } from '@/lib/session';
import { getLLM } from '@/lib/llm';
import { getChat, listMessages, addMessage, setChatTitle } from '@/lib/chat/sessions';
import { answerQuestion } from '@/lib/chat/answer';
import { titleFromQuestion } from '@/lib/chat/title';
import type { ChatMessage } from '@/lib/llm/types';
import type { RetrieveScope } from '@/lib/search/retrieve';

const Body = z.object({ content: z.string().min(1) });
const HISTORY_LIMIT = 8;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  const chat = await getChat(id, { db, schema });
  if (!chat) return new Response('Not found', { status: 404 });
  if (chat.userId !== user.id) return new Response('Forbidden', { status: 403 });
  const { content } = Body.parse(await req.json());

  const prior = await listMessages(id, { db, schema });
  if (prior.length === 0) await setChatTitle(id, titleFromQuestion(content), { db, schema });
  await addMessage({ chatId: id, role: 'user', content }, { db, schema });

  const history: ChatMessage[] = prior
    .slice(-HISTORY_LIMIT)
    .map((m: { role: 'user' | 'assistant'; content: string }) => ({ role: m.role, content: m.content }));

  const scope: RetrieveScope = {
    workspaceId: chat.workspaceId,
    collectionId: chat.scopeKind === 'collection' ? chat.scopeId ?? undefined : undefined,
    parentType: chat.scopeKind === 'paper' ? 'paper' : undefined,
    parentId: chat.scopeKind === 'paper' ? chat.scopeId ?? undefined : undefined,
  };

  let result;
  try {
    result = await answerQuestion(content, getLLM(), db, { scope, schema, history });
  } catch {
    return Response.json({ error: 'Failed to answer. Please try again.' }, { status: 502 });
  }

  const assistant = await addMessage(
    { chatId: id, role: 'assistant', content: result.answer, citations: result.citations },
    { db, schema },
  );
  return Response.json(
    { message: { id: assistant.id, role: 'assistant', content: assistant.content, citations: result.citations } },
    { status: 201 },
  );
}
```

Note: `RetrieveScope` is imported from `@/lib/search/retrieve` (where it is exported), and `ChatMessage` from `@/lib/llm/types`, exactly as written above.

- [ ] **Step 4: Delete the old stateless route**

```bash
git rm src/app/api/chat/route.ts
```

Confirm nothing imports it: `npx eslint src` and a search for `'/api/chat'` (without trailing `s`) — only `ChatPanel.tsx` referenced it, and Task 8 replaces that call.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit` (no new `src/` errors) and `npx eslint "src/app/api/chats/**/*.ts"` (0 errors).

- [ ] **Step 6: Commit**

```bash
git add src/app/api/chats "src/app/api/chat/route.ts"
git commit -m "feat(chat): add /api/chats routes; remove stateless /api/chat"
```

---

### Task 6: Windowed layout + spacing + rail CSS

**Files:**
- Modify: `src/app/styles/screens.css`

- [ ] **Step 1: Inspect the chat route's available height**

Open `src/app/workspaces/[id]/(app)/layout.tsx` and find the element that wraps page content (the `(app)` shell main region). Note whether it constrains height. The windowed chat needs a bounded-height ancestor; we make `.chat-layout` fill the viewport below the top bar.

- [ ] **Step 2: Append the layout CSS**

Append to `src/app/styles/screens.css`:

```css
/* ── Chat: windowed two-pane layout (history rail + conversation) ── */
.chat-layout {
  display: flex;
  /* Fill the area under the top bar so only the message list scrolls (not the page). */
  height: calc(100dvh - var(--topbar-h, 64px));
  min-height: 0;
}
.chat-rail {
  width: 240px;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.chat-rail-head { padding: 12px; }
.chat-rail-list { flex: 1; overflow-y: auto; min-height: 0; padding: 0 8px 12px; }
.chat-rail-item {
  display: flex; align-items: center; gap: 6px;
  width: 100%; text-align: left;
  padding: 8px 10px; border-radius: 8px; font-size: 13px;
  color: var(--ink-2); cursor: pointer; background: transparent; border: none;
}
.chat-rail-item:hover { background: var(--surface-2); }
.chat-rail-item.on { background: var(--surface-2); color: var(--ink); font-weight: 600; }
.chat-rail-item .ri-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chat-rail-del { opacity: 0; color: var(--faint); }
.chat-rail-item:hover .chat-rail-del { opacity: 1; }

.chat { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.chat-scroll { flex: 1; overflow-y: auto; min-height: 0; }
.chat-input-wrap { flex-shrink: 0; }

/* BUG-8: breathing room between a question and the answer that follows it */
.msg-a { margin-top: 16px; }
.msg-q + .msg-a { margin-top: 12px; }

/* Narrow screens: the rail is hidden unless toggled open (the wrapper gets the
   `collapsed-mobile` class when closed — see Task 8). On desktop the media query does
   not apply, so `.collapsed-mobile` has no effect and the rail always shows. */
.chat-history-toggle { display: none; }
@media (max-width: 720px) {
  .chat-rail { position: absolute; z-index: 5; background: var(--surface); height: 100%; }
  .chat-rail.collapsed-mobile { display: none; }
  .chat-history-toggle { display: inline-flex; }
}
```

If the `(app)` layout already bounds content height (e.g. a flex column main), change `.chat-layout` `height` to `height: 100%` and ensure the parent allows it. Pick the value that makes only the message pane scroll; verify in Step 8 manual check. `--topbar-h` may not exist as a token — if so, measure the top bar height from `layout.css`/`screens.css` and substitute the literal px value.

- [ ] **Step 3: Verify CSS loads**

Run: `npx next build` (or rely on Task 9). Expected: build succeeds; no CSS parse errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/styles/screens.css
git commit -m "feat(chat): windowed two-pane layout, rail, and message spacing (BUG-7/BUG-8)"
```

---

### Task 7: `ChatHistoryRail` component

**Files:**
- Create: `src/components/ChatHistoryRail.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client';
import { Icon } from '@/components/ui/Icon';

export interface ChatSummary {
  id: string;
  title: string;
}

export function ChatHistoryRail({
  chats,
  activeId,
  onSelect,
  onNew,
  onDelete,
}: {
  chats: ChatSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <aside className="chat-rail">
      <div className="chat-rail-head">
        <button className="btn btn-primary btn-sm" style={{ width: '100%' }} onClick={onNew}>
          <Icon name="plus" size={14} /> New chat
        </button>
      </div>
      <div className="chat-rail-list">
        {chats.length === 0 && (
          <p className="meta" style={{ padding: '8px 10px' }}>No chats yet.</p>
        )}
        {chats.map((c) => (
          <div
            key={c.id}
            className={'chat-rail-item' + (c.id === activeId ? ' on' : '')}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(c.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(c.id);
              }
            }}
          >
            <Icon name="chat" size={14} />
            <span className="ri-title">{c.title}</span>
            <button
              className="chat-rail-del"
              aria-label="Delete chat"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(c.id);
              }}
            >
              <Icon name="x" size={13} />
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit` and `npx eslint src/components/ChatHistoryRail.tsx`
Expected: no new errors. (Icon names `plus`, `chat`, `x` are already used elsewhere in the codebase.)

- [ ] **Step 3: Commit**

```bash
git add src/components/ChatHistoryRail.tsx
git commit -m "feat(chat): add ChatHistoryRail component"
```

---

### Task 8: Restructure `ChatPanel` + wire the chat page

**Files:**
- Modify: `src/app/workspaces/[id]/(app)/chat/page.tsx`
- Rewrite: `src/components/ChatPanel.tsx`

- [ ] **Step 1: Pass the chat list from the page**

Replace `src/app/workspaces/[id]/(app)/chat/page.tsx` with:

```tsx
import { eq, sql } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { requireUser } from '@/lib/session';
import { listChats } from '@/lib/chat/sessions';
import { ChatPanel } from '@/components/ChatPanel';

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const collections = await db
    .select({ id: schema.collections.id, name: schema.collections.name })
    .from(schema.collections)
    .where(eq(schema.collections.workspaceId, id));

  const [{ paperCount }] = await db
    .select({ paperCount: sql<number>`count(*)::int` })
    .from(schema.papers)
    .where(eq(schema.papers.workspaceId, id));

  const chatRows = user ? await listChats(id, user.id, { db, schema }) : [];
  const initialChats = chatRows.map((c: { id: string; title: string }) => ({ id: c.id, title: c.title }));

  return (
    <ChatPanel
      workspaceId={id}
      collections={collections}
      paperCount={paperCount ?? 0}
      initialChats={initialChats}
    />
  );
}
```

- [ ] **Step 2: Rewrite `src/components/ChatPanel.tsx`**

Replace the entire file with:

```tsx
'use client';
import { useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { ChatHistoryRail, type ChatSummary } from '@/components/ChatHistoryRail';

interface Citation {
  parentType: 'paper' | 'review' | 'annotation';
  parentId: string;
  title: string;
  page: number | null;
}
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: Citation[];
  pending?: boolean;
}
type ScopeKind = 'workspace' | 'collection' | 'paper';
interface Scope {
  kind: ScopeKind;
  collectionId?: string;
  parentId?: string;
}

const SUGGESTED_Q = [
  'What are the key findings across this workspace?',
  'Where do papers agree or disagree on the main topic?',
  'What methodologies are used across these studies?',
];

function AnswerText({
  text,
  citations,
  workspaceId,
}: {
  text: string;
  citations: Citation[];
  workspaceId: string;
}) {
  const parts = text.split(/\[(\d+)\]/g);
  if (parts.length === 1) return <div className="answer">{text}</div>;
  return (
    <div className="answer">
      {parts.map((part, i) => {
        if (i % 2 === 0) return part ? <span key={i}>{part}</span> : null;
        const n = parseInt(part, 10);
        const cite = citations[n - 1];
        if (!cite) return <sup key={i}>[{part}]</sup>;
        const href =
          cite.parentType === 'paper' ? `/workspaces/${workspaceId}/papers/${cite.parentId}` : undefined;
        return href ? (
          <Link key={i} href={href}>
            <sup>{n}</sup>
          </Link>
        ) : (
          <sup key={i}>{n}</sup>
        );
      })}
    </div>
  );
}

export function ChatPanel({
  workspaceId,
  collections,
  paperCount,
  initialChats,
}: {
  workspaceId: string;
  collections: { id: string; name: string }[];
  paperCount: number;
  initialChats: ChatSummary[];
}) {
  const [chats, setChats] = useState<ChatSummary[]>(initialChats);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [scope, setScope] = useState<Scope>({ kind: 'workspace' });
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [railOpen, setRailOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const tmpKeyRef = useRef(0);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => scrollRef.current?.scrollTo({ top: 1e9, behavior: 'smooth' }), 40);
  }, []);

  async function selectChat(id: string) {
    setError('');
    setRailOpen(false);
    const res = await fetch(`/api/chats/${id}`);
    if (!res.ok) {
      setError('Could not load chat.');
      return;
    }
    const data = await res.json();
    setActiveChatId(id);
    setMessages(
      data.messages.map((m: { id: string; role: 'user' | 'assistant'; content: string; citations: Citation[] | null }) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        citations: m.citations ?? [],
      })),
    );
    const c = data.chat;
    setScope(
      c.scopeKind === 'collection'
        ? { kind: 'collection', collectionId: c.scopeId }
        : c.scopeKind === 'paper'
          ? { kind: 'paper', parentId: c.scopeId }
          : { kind: 'workspace' },
    );
    scrollToBottom();
  }

  function newChat() {
    setActiveChatId(null);
    setMessages([]);
    setError('');
    setRailOpen(false);
  }

  async function deleteChat(id: string) {
    await fetch(`/api/chats/${id}`, { method: 'DELETE' });
    setChats((prev) => prev.filter((c) => c.id !== id));
    if (activeChatId === id) newChat();
  }

  function scopeForCreate() {
    return {
      scopeKind: scope.kind,
      scopeId:
        scope.kind === 'collection' ? scope.collectionId : scope.kind === 'paper' ? scope.parentId : undefined,
    };
  }

  async function send(question?: string) {
    const q = (question ?? input).trim();
    if (!q || sending) return;
    setSending(true);
    setError('');
    setInput('');

    let chatId = activeChatId;
    if (!chatId) {
      const cr = await fetch('/api/chats', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workspaceId, ...scopeForCreate() }),
      });
      if (!cr.ok) {
        setError('Could not start chat.');
        setSending(false);
        return;
      }
      chatId = (await cr.json()).id as string;
      setActiveChatId(chatId);
      setChats((prev) => [{ id: chatId as string, title: q.length > 60 ? q.slice(0, 60) + '…' : q }, ...prev]);
    }

    const tmp = `tmp-${++tmpKeyRef.current}`;
    setMessages((prev) => [
      ...prev,
      { id: tmp + '-q', role: 'user', content: q, citations: [] },
      { id: tmp + '-a', role: 'assistant', content: '', citations: [], pending: true },
    ]);
    scrollToBottom();

    try {
      const res = await fetch(`/api/chats/${chatId}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: q }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `Error ${res.status}`);
        setMessages((prev) => prev.filter((m) => m.id !== tmp + '-a'));
        return;
      }
      const data = await res.json();
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tmp + '-a'
            ? { id: data.message.id, role: 'assistant', content: data.message.content, citations: data.message.citations ?? [] }
            : m,
        ),
      );
      setChats((prev) => {
        const me = prev.find((c) => c.id === chatId);
        return me ? [me, ...prev.filter((c) => c.id !== chatId)] : prev;
      });
      scrollToBottom();
    } catch {
      setError('Network error. Please try again.');
      setMessages((prev) => prev.filter((m) => m.id !== tmp + '-a'));
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="chat-layout">
      <div className={'chat-rail' + (railOpen ? '' : ' collapsed-mobile')}>
        <ChatHistoryRail
          chats={chats}
          activeId={activeChatId}
          onSelect={selectChat}
          onNew={newChat}
          onDelete={deleteChat}
        />
      </div>

      <div className="chat">
        <div className="chat-scope">
          <button
            className="btn btn-quiet btn-sm chat-history-toggle"
            onClick={() => setRailOpen((o) => !o)}
            aria-label="Toggle history"
          >
            <Icon name="chat" size={14} /> History
          </button>
          <span className="meta" style={{ marginRight: 4 }}>Scope</span>
          <button
            className={'scope-pill' + (scope.kind === 'workspace' ? ' on' : '')}
            onClick={() => setScope({ kind: 'workspace' })}
          >
            <Icon name="layers" size={14} /> Whole workspace
          </button>
          {collections.map((c) => (
            <button
              key={c.id}
              className={'scope-pill' + (scope.kind === 'collection' && scope.collectionId === c.id ? ' on' : '')}
              onClick={() => setScope({ kind: 'collection', collectionId: c.id })}
            >
              <Icon name="grid" size={14} /> {c.name}
            </button>
          ))}
        </div>

        {messages.length === 0 ? (
          <div className="chat-empty">
            <div className="ce-mark">
              <Icon name="chat" size={28} />
            </div>
            <h2>Ask your corpus</h2>
            <p className="muted">
              Answers are drawn only from this workspace&apos;s papers, reviews and notes — each claim links
              back to its source.
            </p>
            <div className="chat-suggest">
              {SUGGESTED_Q.map((q) => (
                <button key={q} onClick={() => send(q)}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="chat-scroll" ref={scrollRef}>
            {messages.map((m) =>
              m.role === 'user' ? (
                <div className="msg-q" key={m.id}>
                  {m.content}
                </div>
              ) : (
                <div className="msg-a" key={m.id}>
                  <div className="ai-mark">
                    <Icon name="sparkle" size={17} />
                  </div>
                  <div className="msg-a-body">
                    {m.pending ? (
                      <div className="answer" style={{ color: 'var(--muted)' }}>
                        Thinking…
                      </div>
                    ) : (
                      <>
                        <AnswerText text={m.content} citations={m.citations} workspaceId={workspaceId} />
                        {m.citations.length > 0 && (
                          <div className="cites">
                            <div className="cites-head">{m.citations.length} sources</div>
                            {m.citations.map((c, j) => {
                              const href =
                                c.parentType === 'paper'
                                  ? `/workspaces/${workspaceId}/papers/${c.parentId}`
                                  : undefined;
                              const inner = (
                                <>
                                  <span className="cite-num">{j + 1}</span>
                                  <div className="cite-body">
                                    <div className="cite-src">
                                      <span className="cite-type">{c.parentType}</span>
                                      {c.title}
                                      {c.page != null ? ` · p.${c.page}` : ''}
                                    </div>
                                  </div>
                                  <Icon
                                    name="arrowRight"
                                    size={15}
                                    style={{ color: 'var(--faint)', alignSelf: 'center' }}
                                  />
                                </>
                              );
                              return href ? (
                                <Link key={j} href={href} className="cite">
                                  {inner}
                                </Link>
                              ) : (
                                <div key={j} className="cite">
                                  {inner}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ),
            )}
          </div>
        )}

        <div className="chat-input-wrap">
          <div className="chat-input">
            <textarea
              rows={1}
              placeholder="Ask about your papers…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sending}
            />
            <button
              className="btn btn-primary btn-icon"
              style={{ width: 40, height: 40, flexShrink: 0 }}
              onClick={() => send()}
              disabled={sending || !input.trim()}
            >
              <Icon name="arrowRight" size={18} />
            </button>
          </div>
          <div className="chat-hint">
            Answers cite only your workspace · {paperCount} paper{paperCount !== 1 ? 's' : ''} in scope
          </div>
          {error && (
            <p style={{ color: 'var(--danger, red)', fontSize: 13, textAlign: 'center', marginTop: 6 }}>{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
```

Note on the mobile toggle: the rail wrapper gets the `collapsed-mobile` class when the rail is closed. Task 6 already defines the matching `@media (max-width: 720px) { .chat-rail.collapsed-mobile { display: none } }` rule, so no CSS change is needed here — just confirm the class name matches.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` (no new `src/` errors) and `npx eslint src/components/ChatPanel.tsx "src/app/workspaces/[id]/(app)/chat/page.tsx"` (0 errors).

- [ ] **Step 4: Manual check (cannot be headless)**

`npm run dev`: open a workspace's chat. Send a question → it persists and answers; a chat appears in the rail. Reload → the chat is still in the rail and reopens with its messages. The composer stays pinned and only the message list scrolls. Start a "New chat", ask a follow-up referencing the prior answer to sanity-check memory. Delete a chat from the rail.

- [ ] **Step 5: Commit**

```bash
git add src/components/ChatPanel.tsx "src/app/workspaces/[id]/(app)/chat/page.tsx" src/app/styles/screens.css
git commit -m "feat(chat): persistent two-pane chat with history, resume, and memory (BUG-7/BUG-8)"
```

---

### Task 9: Full verification + backlog

**Files:**
- Modify: `docs/BACKLOG.md`

- [ ] **Step 1: Full suite**

Run: `npx vitest run`
Expected: all green, including the 3 new specs (`chat-title`, `chat-sessions`, `chat-history`). No regressions.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: only the pre-existing `tests/ui/*` errors (23 baseline); zero new in `src/`.

- [ ] **Step 3: Lint changed files**

Run: `npx eslint src/lib/chat src/components/ChatPanel.tsx src/components/ChatHistoryRail.tsx "src/app/api/chats" "src/app/workspaces/[id]/(app)/chat/page.tsx"`
Expected: 0 errors.

- [ ] **Step 4: Build**

Run: `npx next build`
Expected: succeeds; route list shows `/api/chats`, `/api/chats/[id]`, `/api/chats/[id]/messages`, and no `/api/chat`.

- [ ] **Step 5: Update the backlog**

In `docs/BACKLOG.md`, mark BUG-7 (chat windowing + sessions/history) and BUG-8 (message spacing) DONE, noting the new tables and routes, and that history-aware retrieval (BUG-6 / 3b) and deep-linked citations (3c) remain. Commit:

```bash
git add docs/BACKLOG.md
git commit -m "docs: mark BUG-7/BUG-8 done (Phase 3a chat sessions)"
```

---

## Self-Review

**Spec coverage:**
- `chats`/`chatMessages` tables, private per-user, scope, updatedAt → Task 1 ✓
- `titleFromQuestion` → Task 2 ✓
- Sessions service (create/list/get/listMessages/addMessage/setChatTitle/delete; user-scoped; cascade; updatedAt bump) → Task 3 ✓
- `answerQuestion` bounded history → Task 4 (HISTORY_LIMIT applied by caller in Task 5) ✓
- Routes create/list/get/delete/messages; remove `/api/chat` → Task 5 ✓
- Windowed layout, pinned composer, spacing, rail → Tasks 6–8 ✓
- Lazy chat creation on first send → Task 8 `send()` ✓
- Page fetches user's chats → Task 8 Step 1 ✓
- Tests: service/DB (incl. user isolation + cascade), title unit, history → Tasks 2–4 ✓
- Error handling (user msg persisted; 502 on LLM failure; UI inline error) → Task 5 messages route + Task 8 `send()` ✓

**Placeholder scan:** No TBD/TODO. The generated migration filename is intentionally a glob (`0005_*.sql`) because Drizzle names it; Step 2 of Task 1 states exactly what it must contain. Every code step shows complete code.

**Type consistency:** `Deps = { db, schema }` across the service; `ChatMessage` (role/content) used in `answerQuestion` and the messages route; `RetrieveScope` imported from `@/lib/search/retrieve` (Task 5 corrects the import); `ChatSummary { id, title }` defined in `ChatHistoryRail` and imported by `ChatPanel`; `Citation`/`Message` shapes consistent between `ChatPanel` and the messages-route response (`{ message: { id, role, content, citations } }`). The rail-collapse class is reconciled to `.chat-rail.collapsed-mobile` in Task 8 Step 3 (overriding the placeholder `.collapsed` in Task 6).

**Known minor:** the rail's optimistic title (client truncation) can differ slightly from the server's word-boundary `titleFromQuestion`; it self-corrects on next page load. Acceptable (documented in spec).
