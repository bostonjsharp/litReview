# Phase 3b — Smarter Retrieval (Design)

Date: 2026-06-04
Status: approved (design approved inline; proceeding to plan)
Backlog item: BUG-6

## Goal

Make the chat agent less rigid: retrieve on a rewritten, history-aware, expanded query
instead of the raw question, pull a bit more context, and answer by synthesizing across
the passages rather than refusing on near-misses — while staying strictly corpus-grounded
and cited.

This is **slice 3b** of Phase 3. 3a (chat sessions) is done. 3c (search bar + precise
citation deep-links) is separate. 3b is backend-only and isolated.

## Decisions made during brainstorming

- **Single history-aware query rewrite** (not multi-query/HyDE): one cheap `llm.complete()`
  call per question. Resolves chat-history references and expands terms. This also
  delivers the history-aware retrieval that 3a deferred.
- **Stay corpus-grounded.** Answers use only the retrieved passages and cite them; the
  app's trust model ("answers only from your corpus") is preserved. The change is to
  **synthesize/reason across passages and refuse far less eagerly** — not to add outside
  knowledge.
- **Modest retrieval tuning:** default `k` 8 → 12; hybrid keyword weight `0.1 → 0.05`
  (semantic leads; the rewrite already broadens lexical coverage). Both easily retuned.

## Current state (what we're changing)

- `src/lib/search/retrieve.ts` — embeds the **raw** query and blends cosine distance with
  `ts_rank(plainto_tsquery('english', query))` at weight `0.1`, `k = 8`.
- `src/lib/chat/answer.ts` — `answerQuestion(query, llm, db, { scope, k, schema, history })`
  retrieves on `query`, early-returns "I could not find this in the corpus." when context
  is empty, else `llm.chat([...history, {role:'user',content:query}], context)`.
- `src/lib/llm/openai.ts` — `chat()` system prompt: "Use ONLY the numbered context
  passages. If the answer is not in the context, say 'I could not find this in the
  corpus.' Cite by bracket number. JSON {answer, citationIndexes}." Model `gpt-4o-mini`.
  `complete(prompt)` already exists (JSON-object response) — reused for rewriting.

## Architecture

### 1. Query rewriting — `src/lib/chat/rewrite.ts` (new)

```ts
rewriteSearchQuery(question: string, history: ChatMessage[], llm: LLMProvider): Promise<string>
```

- Builds a prompt: given the recent conversation and the latest question, produce ONE
  standalone search query that (a) resolves pronouns/references using the history and
  (b) lightly expands with synonyms/related terms. Ask for JSON `{"query": string}`.
- Calls `llm.complete(prompt)`, parses JSON, returns the trimmed `query`.
- **Fallback:** on any error, empty result, or unparseable output, return the original
  `question` (rewriting must never block or degrade an answer).
- Pure except for the injected `llm`; unit-testable with a fake `complete`.

### 2. Wire into `answerQuestion` (`src/lib/chat/answer.ts`)

New flow:
```
searchQuery = await rewriteSearchQuery(query, history ?? [], llm)   // 1 complete() call
context     = await retrieve(searchQuery, llm, db, { scope, k, schema })
if (context empty) → "I could not find this in the corpus."
return llm.chat([...history, { role:'user', content: query }], context)  // answer ORIGINAL query
```

So retrieval uses the rewritten/expanded query; the model still answers the user's
actual wording. `k` default becomes 12 (see below). History continues to come from the
caller (the messages route passes the last 8).

### 3. Retrieval tuning (`src/lib/search/retrieve.ts`)

- `const k = opts.k ?? 12;` (was 8).
- Hybrid order-by weight: `... - 0.05 * ts_rank(...)` (was `0.1`).
- No structural change; same hybrid vector+full-text ranking.

### 4. Softened answer prompt (`src/lib/llm/openai.ts`)

Rewrite the `system` content to (keeping JSON output + `citationIndexes` + bracket
citations, and corpus-only grounding):

> You answer questions about a corpus of academic papers and literature reviews, using
> ONLY the numbered context passages. Synthesize and reason across the passages — connect
> related points, compare, and infer what they collectively support — to give a thorough,
> helpful answer. Do not use outside knowledge. Cite the passages you rely on by their
> bracket number. Only if the passages genuinely do not address the question, answer
> exactly "I could not find this in the corpus." Respond as strict JSON:
> {"answer": string, "citationIndexes": number[]} — citationIndexes lists the 1-based
> passages you actually used.

## Data flow (one chat turn, after 3b)

```
POST /api/chats/[id]/messages
  → persist user msg
  → answerQuestion(question, llm, db, { scope, schema, history: last 8 }):
       rewriteSearchQuery(question, history)  →  searchQuery   [complete()]
       retrieve(searchQuery, k=12)            →  context       [embed + SQL]
       llm.chat([...history, question], context)               [chat(), softened prompt]
  → persist assistant msg (+ citations)
```

## Error handling

- Rewrite failure → silently fall back to the raw question (logged, not surfaced).
- Empty retrieval → unchanged "I could not find this in the corpus." assistant message.
- `llm.chat` failure → unchanged (messages route returns 502; user message already saved).

## Testing strategy

- **`tests/unit/rewrite.test.ts`** — `rewriteSearchQuery` with a fake `llm` whose
  `complete` returns `{"query": "..."}`: (a) returns the rewritten query; (b) resolves a
  history reference (prompt includes history — assert the call happened / output used);
  (c) falls back to the raw question when `complete` throws or returns junk.
- **`tests/integration/retrieve-rewrite.test.ts`** (or extend `chat-history.test.ts`) —
  `answerQuestion` with a fake `llm` recording `embed` inputs and `chat` messages: assert
  retrieval **embeds the rewritten query** while `chat` receives the **original**
  question as the final user message. Seed one chunk so retrieval is non-empty.
- **Retrieval tuning** (`k`, weight) — covered by existing `retrieve.test.ts` still
  passing; if it asserts a specific `k`, update it to 12.
- **Softened prompt** — a reviewed text change in the real provider (its prompt isn't
  unit-tested in this repo); quality is a manual-eval concern, not an automated test.

## Out of scope (later)

- Multi-query / HyDE retrieval, reranking models, adaptive-`k`.
- Outside-knowledge answers / "beyond your library" mode (explicitly rejected — stay grounded).
- Standalone search bar and citation deep-links → slice 3c.
- The N+1 parent-title lookups in `retrieve.ts` (pre-existing perf note) — not in scope.

## Risks / notes

- Every answer now makes one extra `complete()` call (the rewrite). Accepted (the user
  chose single-rewrite knowing the cost). The fallback keeps answers working if it fails.
- Keep the rewrite prompt tight so it returns a query, not an answer; the JSON
  `{query}` contract + fallback guards against drift.
