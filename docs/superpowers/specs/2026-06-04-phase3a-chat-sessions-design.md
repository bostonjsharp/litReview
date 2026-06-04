# Phase 3a — Conversational Chat: Sessions, History & Windowed Layout (Design)

Date: 2026-06-04
Status: approved (pending spec review)
Backlog items: BUG-7, BUG-8

## Goal

Turn the chat from a single ephemeral, page-growing exchange into a persistent,
windowed, multi-conversation experience: users can start new chats, see a history of
their past chats, resume them, and follow up with conversational memory — while the
composer stays pinned and only the message list scrolls.

This is **slice 3a** of Phase 3. Retrieval quality (BUG-6) is slice 3b; the standalone
search bar and precise citation deep-links (FEAT-1 / BUG-9 chat side) are slice 3c. Each
is its own spec → plan → build. 3a is isolated from both.

## Decisions made during brainstorming

- **Chats are private per user.** A chat belongs to `(workspaceId, userId)`; users see
  only their own. Sharing can be added later without migrating data.
- **Titles are derived from the first question** (truncated ~60 chars) — no extra LLM
  call. AI-generated titles can come later.
- **Conversational memory is bounded** to roughly the last 8 messages per turn (cost
  control), plus fresh retrieval for the new query.
- **Retrieval stays query-only here.** Making retrieval history-aware (resolving "it"/
  "that") belongs to slice 3b; 3a must not build that to avoid rework.

## Current state (what we're changing)

- `src/components/ChatPanel.tsx` holds the whole conversation in React `useState`
  (`turns[]`) — nothing is persisted; refresh loses it. Layout (`.chat` → `.chat-scroll`
  → `.chat-input-wrap`) does not constrain height, so the page grows downward (BUG-7),
  and `.msg-q`/`.msg-a` have no vertical gap (BUG-8).
- `POST /api/chat` (`src/app/api/chat/route.ts`) is stateless: it calls
  `answerQuestion(query, llm, db, { scope, schema })`, which retrieves and calls
  `llm.chat([{ role:'user', content: query }], context)` — a single turn, no history.
- No chat/message tables exist.

## Architecture

### Data model (Drizzle, two new tables + migration)

```
chats:
  id          uuid pk default random
  workspaceId uuid not null → workspaces(id)
  userId      uuid not null → users(id)
  title       text not null
  scopeKind   text not null default 'workspace'   -- 'workspace' | 'collection' | 'paper'
  scopeId     uuid                                  -- collectionId or paperId; null for workspace
  createdAt   timestamp default now() not null
  updatedAt   timestamp default now() not null

chatMessages:
  id         uuid pk default random
  chatId     uuid not null → chats(id) on delete cascade
  role       text not null                          -- 'user' | 'assistant'
  content    text not null
  citations  jsonb                                  -- Citation[] for assistant turns; null otherwise
  createdAt  timestamp default now() not null
```

`updatedAt` on `chats` is bumped whenever a message is added, so history can sort by most
recent activity. `chatMessages.chatId` cascades on delete.

Follow existing schema conventions in `src/db/schema.ts` (uuid `defaultRandom().primaryKey()`,
`text`/`timestamp`, references). Generate the migration with `npm run db:gen` and apply with
`npm run db:migrate` (the test harness re-applies migrations automatically).

### Service layer — `src/lib/chat/sessions.ts` (new, pure-ish, dependency-injected)

A small module with focused, testable functions (mirrors `src/lib/annotate/service.ts`
style: `Deps = { db, schema }`):

- `createChat({ workspaceId, userId, title, scopeKind, scopeId }, deps) → chat`
- `listChats(workspaceId, userId, deps) → chat[]` — ordered by `updatedAt` desc.
- `getChat(chatId, deps) → chat | undefined`
- `listMessages(chatId, deps) → message[]` — ordered by `createdAt` asc.
- `addMessage({ chatId, role, content, citations? }, deps) → message` — also bumps the
  parent chat's `updatedAt`.
- `deleteChat(chatId, deps)` — relies on the FK cascade for messages.

Title helper — `src/lib/chat/title.ts` (new, pure):
- `titleFromQuestion(q: string): string` — trims, collapses whitespace, truncates to ≤60
  chars on a word boundary, appends `…` when cut; falls back to `"New chat"` if empty.

### Conversational memory — extend `answerQuestion`

`src/lib/chat/answer.ts` gains an optional `history`:

```ts
export interface AnswerOpts {
  scope?: RetrieveScope;
  k?: number;
  schema: any;
  history?: { role: 'user' | 'assistant'; content: string }[]; // prior turns, oldest→newest
}
```

It retrieves on the current `query` (unchanged) and calls
`llm.chat([...(opts.history ?? []), { role: 'user', content: query }], context)`.
The caller passes at most the last 8 messages. Empty-context behavior (the
"I could not find this in the corpus." early return) is unchanged.

### API routes (App Router)

- `POST /api/chats` — body `{ workspaceId, scopeKind?, scopeId? }`; `requireUser` +
  `requireMember`; creates a chat with a placeholder title (`"New chat"`) and returns
  `{ id }`. (Title is finalized on the first message.)
- `GET /api/chats?workspaceId=…` — list the current user's chats for the workspace.
- `GET /api/chats/[id]` — returns `{ chat, messages }`; 404 if not found, 403 if the
  chat's `userId` ≠ current user.
- `DELETE /api/chats/[id]` — delete (owner only).
- `POST /api/chats/[id]/messages` — body `{ content }`; owner-only. Steps:
  1. Load chat + its messages (for history + ownership).
  2. If this is the first user message, set the chat title via `titleFromQuestion`.
  3. `addMessage({ role:'user', content })`.
  4. `answerQuestion(content, llm, db, { scope from chat, schema, history: last 8 })`.
  5. `addMessage({ role:'assistant', content: answer, citations })`.
  6. Return the assistant message `{ id, content, citations }`.

The stateless `POST /api/chat` route is **removed**; `ChatPanel` no longer calls it.
`answerQuestion` (the function) is retained and reused by the new route.

### UI — `src/components/ChatPanel.tsx` + a history rail

Restructure the chat page into two panes within a fixed-height flex container:

- **History rail (left):** "New chat" button + the user's chats grouped loosely by recency
  (Today / Earlier is optional polish — at minimum a flat list ordered by `updatedAt`),
  each row showing the title; a small delete affordance on hover. Selecting a chat loads
  it. On narrow viewports the rail collapses behind a "History" toggle.
- **Conversation pane (right):** the scope selector (kept as-is) at top, the **scrollable
  message list as the only scroller** (`flex: 1; overflow-y: auto`), composer pinned at
  the bottom. Add vertical spacing between `.msg-q` and the following `.msg-a` (BUG-8).
- **Behavior:** "New chat" creates a chat (lazily — see below) and shows the empty state
  with suggested questions. Sending a message posts to
  `/api/chats/[id]/messages`, optimistically appends the user turn + a "Thinking…"
  placeholder, then fills in the assistant turn. The rail refreshes title/order after the
  first message.
- **Lazy creation (the chosen approach):** to avoid empty junk chats, the chat row is
  created on the *first send* — the client POSTs `/api/chats` to get an id, then POSTs the
  message to `/api/chats/[id]/messages`. "New chat" merely resets the pane to the empty
  state (no row yet). A chat with no messages therefore never exists.

The chat page server component (`/workspaces/[id]/chat`) fetches the user's chat list and
passes it to the client, plus collections for the scope selector (as today).

### CSS — `src/app/styles/screens.css`

Convert `.chat` to a fixed-height flex layout (fill the content area), make
`.chat-scroll` the sole scroller, pin `.chat-input-wrap`, add the `.msg-q`→`.msg-a` gap,
and add history-rail classes. Reuse existing tokens and the `.theme-pop`/menu patterns for
the rail and delete affordance.

## Data flow (one turn)

```
user types → POST /api/chats/[id]/messages { content }
  → persist user message (+ set title if first)
  → answerQuestion(content, history=last 8, scope)  → retrieve + llm.chat
  → persist assistant message (+ citations), bump chat.updatedAt
  → return assistant message → UI replaces "Thinking…" ; rail re-sorts
```

## Error handling

- Unauthorized → 401; non-member or non-owner → 403; unknown chat → 404.
- LLM/retrieval failure inside `POST …/messages`: the **user message is already
  persisted**; return a 5xx with an error, and the UI shows an inline error on that turn
  (it can be retried by re-sending). Do not leave a half-written assistant turn.
- Empty corpus → the existing "I could not find this in the corpus." assistant message
  (persisted like any answer).

## Testing strategy

**Service/DB tests** (Vitest against the Neon test DB, like Phase 1) in
`tests/integration/chat-sessions.test.ts`:
- create → list returns it; **listChats is user-scoped** (user A cannot see user B's
  chats in the same workspace).
- addMessage appends and bumps `chats.updatedAt`; `listChats` re-orders by recency.
- getChat/listMessages return ordered messages.
- deleteChat removes the chat and (cascade) its messages.
- `answerQuestion` with a `history` array passes `[...history, current]` to a fake
  `llm.chat` (assert the messages argument) — extends `tests/integration/upload-flow.test.ts`
  patterns or a new `tests/integration/chat-history.test.ts`.

**Unit test** `tests/unit/chat-title.test.ts`: `titleFromQuestion` — trims/collapses, ≤60
chars, word-boundary truncation with `…`, empty → "New chat".

**UI** (windowed layout, rail, lazy create) — verified by `tsc` + `eslint` + `next build`
+ a manual click-through (cannot be rendered headlessly in this repo).

## Out of scope (later slices / phases)

- History-aware retrieval / query rewriting → 3b.
- Standalone search bar; precise citation deep-links (`?ann=` / `?at=`) → 3c.
- Shared/collaborative chats, AI-generated titles, chat rename, streaming responses,
  message editing → future, not now (YAGNI).

## Risks / notes

- `ChatPanel.tsx` is being substantially restructured; keep the message-rendering
  (`AnswerText`, citations) intact and focus changes on layout + persistence wiring.
- Citations are stored as `jsonb`; keep the stored shape identical to the current
  `Citation` type so rendering is unchanged.
- Bump `chats.updatedAt` in the same logical operation as `addMessage` so history
  ordering stays correct.
