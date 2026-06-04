# Phase 3b — Smarter Retrieval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make chat retrieval less rigid — rewrite each question into a history-aware, expanded search query before retrieving, pull more context (`k` 8→12), down-weight exact keyword matching, and soften the answer prompt to synthesize (still corpus-grounded).

**Architecture:** A new `rewriteSearchQuery` (one `llm.complete()` call, with a fallback to the raw question) wired into `answerQuestion` so retrieval runs on the rewritten query while the model still answers the original; plus two one-line tuning changes in `retrieve.ts` and a reworded system prompt in `openai.ts`.

**Tech Stack:** TypeScript, Vitest (unit + Neon test DB integration), OpenAI provider behind the `LLMProvider` interface.

Spec: `docs/superpowers/specs/2026-06-04-phase3b-smarter-retrieval-design.md`

## File map
- `src/lib/chat/rewrite.ts` — `rewriteSearchQuery` (new)
- `src/lib/chat/answer.ts` — wire rewrite in; pass `k` through (modify)
- `src/lib/search/retrieve.ts` — default `k` 8→12, keyword weight 0.1→0.05 (modify)
- `src/lib/llm/openai.ts` — softened system prompt (modify)
- Tests: `tests/unit/rewrite.test.ts`, `tests/integration/retrieve-rewrite.test.ts`, plus a case added to `tests/integration/retrieve.test.ts`

Why existing tests stay green: `rewriteSearchQuery` wraps the `llm.complete()` call in try/catch, so callers whose fake `llm` lacks `complete` (e.g. `upload-flow.test.ts`) or returns `undefined` (`chat-history.test.ts`) silently fall back to the raw query — retrieval and `chat` behave exactly as before.

---

### Task 1: `rewriteSearchQuery` helper (TDD)

**Files:**
- Create: `src/lib/chat/rewrite.ts`
- Test: `tests/unit/rewrite.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/rewrite.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { rewriteSearchQuery } from '@/lib/chat/rewrite';
import type { ChatMessage } from '@/lib/llm/types';

function llmReturning(out: string) {
  return { complete: vi.fn(async () => out), embed: vi.fn(), chat: vi.fn() } as any;
}

describe('rewriteSearchQuery', () => {
  it('returns the rewritten query from the LLM', async () => {
    const llm = llmReturning(JSON.stringify({ query: 'limitations of Transformer models' }));
    const history: ChatMessage[] = [{ role: 'user', content: 'Tell me about Transformers' }];
    const out = await rewriteSearchQuery('what about its limitations?', history, llm);
    expect(out).toBe('limitations of Transformer models');
  });

  it('passes the conversation history into the prompt', async () => {
    const llm = llmReturning(JSON.stringify({ query: 'x' }));
    await rewriteSearchQuery('follow up', [{ role: 'assistant', content: 'BERT is a model' }], llm);
    const prompt = (llm.complete as any).mock.calls[0][0] as string;
    expect(prompt).toContain('BERT is a model');
    expect(prompt).toContain('follow up');
  });

  it('falls back to the original question when complete throws', async () => {
    const llm = { complete: vi.fn(async () => { throw new Error('down'); }), embed: vi.fn(), chat: vi.fn() } as any;
    expect(await rewriteSearchQuery('raw q', [], llm)).toBe('raw q');
  });

  it('falls back when output is not valid JSON or the query is empty', async () => {
    expect(await rewriteSearchQuery('raw a', [], llmReturning('not json'))).toBe('raw a');
    expect(await rewriteSearchQuery('raw b', [], llmReturning(JSON.stringify({ query: '   ' })))).toBe('raw b');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/rewrite.test.ts`
Expected: FAIL — "Cannot find module '@/lib/chat/rewrite'".

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/chat/rewrite.ts`:

```ts
import type { ChatMessage, LLMProvider } from '../llm/types';

// Rewrites the user's latest question into a single standalone, lightly-expanded search
// query — resolving references using the conversation so chat follow-ups retrieve well.
// Never throws: any failure (no/failed `complete`, bad JSON, empty query) falls back to
// the original question so retrieval is never blocked or degraded.
export async function rewriteSearchQuery(
  question: string,
  history: ChatMessage[],
  llm: LLMProvider,
): Promise<string> {
  try {
    const convo = history.map((m) => `${m.role}: ${m.content}`).join('\n');
    const prompt =
      "You rewrite a user's latest question into ONE standalone search query for retrieving " +
      'passages from a corpus of academic papers. Resolve references (pronouns like "it"/"that") ' +
      'using the conversation, and lightly expand with closely-related terms or synonyms. ' +
      'Do NOT answer the question. ' +
      (convo ? `Conversation so far:\n${convo}\n\n` : '') +
      `Latest question: ${question}\n\n` +
      'Respond as strict JSON: {"query": string}.';
    const raw = await llm.complete(prompt);
    const parsed = JSON.parse(raw) as { query?: string };
    const q = (parsed.query ?? '').trim();
    return q.length > 0 ? q : question;
  } catch {
    return question;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/rewrite.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/chat/rewrite.ts tests/unit/rewrite.test.ts
git commit -m "feat(chat): add history-aware rewriteSearchQuery helper"
```

---

### Task 2: Wire rewrite into `answerQuestion` (TDD)

**Files:**
- Modify: `src/lib/chat/answer.ts`
- Test: `tests/integration/retrieve-rewrite.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/integration/retrieve-rewrite.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { makeTestDb } from '../helpers/testdb';
import { answerQuestion } from '@/lib/chat/answer';
import type { ChatMessage } from '@/lib/llm/types';

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => { ctx = await makeTestDb(); });
afterAll(async () => { await ctx.sql.end(); });

it('retrieves on the rewritten query but answers the original question', async () => {
  // Seed one chunk so retrieval returns context (else answerQuestion early-returns).
  await ctx.db.insert(ctx.schema.chunks).values({
    parentType: 'paper', parentId: crypto.randomUUID(), chunkIndex: 0,
    text: 'Transformers scale well.', embedding: Array(1536).fill(0.01), charStart: 0, charEnd: 24,
  });

  const embedInputs: string[][] = [];
  let chatMessages: ChatMessage[] = [];
  const llm = {
    complete: vi.fn(async () => JSON.stringify({ query: 'rewritten search query' })),
    embed: vi.fn(async (t: string[]) => { embedInputs.push(t); return t.map(() => Array(1536).fill(0.01)); }),
    chat: vi.fn(async (messages: ChatMessage[]) => { chatMessages = messages; return { answer: 'ok', citations: [] }; }),
  } as any;

  const history: ChatMessage[] = [{ role: 'user', content: 'about transformers' }];
  await answerQuestion('original question', llm, ctx.db, { schema: ctx.schema, history });

  // Retrieval embedded the rewritten query…
  expect(embedInputs).toContainEqual(['rewritten search query']);
  // …but the model answered the user's ORIGINAL wording (last message).
  expect(chatMessages[chatMessages.length - 1]).toEqual({ role: 'user', content: 'original question' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/retrieve-rewrite.test.ts`
Expected: FAIL — today `answerQuestion` embeds the original `'original question'`, so `embedInputs` contains `['original question']`, not `['rewritten search query']`.

- [ ] **Step 3: Write minimal implementation**

Replace `src/lib/chat/answer.ts` with:

```ts
import { retrieve, type RetrieveScope } from '../search/retrieve';
import type { LLMProvider, ChatResult, ChatMessage } from '../llm/types';
import { rewriteSearchQuery } from './rewrite';

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
  const history = opts.history ?? [];
  // Retrieve on a rewritten, history-aware query; answer the user's original wording.
  const searchQuery = await rewriteSearchQuery(query, history, llm);
  const context = await retrieve(searchQuery, llm, db, { scope: opts.scope, k: opts.k, schema: opts.schema });
  if (context.length === 0) {
    return { answer: 'I could not find this in the corpus.', citations: [] };
  }
  return llm.chat([...history, { role: 'user', content: query }], context);
}
```

(Note: `k: opts.k` — no `?? 8` — so the default now comes from `retrieve` (set to 12 in Task 3). Callers passing an explicit `k` are unaffected.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/integration/retrieve-rewrite.test.ts`
Expected: PASS.

Then run the two existing callers' tests to confirm the fallback keeps them green:
Run: `npx vitest run tests/integration/chat-history.test.ts tests/integration/upload-flow.test.ts`
Expected: PASS (their fake `llm` returns `undefined`/lacks `complete`, so `rewriteSearchQuery` falls back to the raw query — retrieval and `chat` behave as before).

- [ ] **Step 5: Commit**

```bash
git add src/lib/chat/answer.ts tests/integration/retrieve-rewrite.test.ts
git commit -m "feat(chat): retrieve on a rewritten query, answer the original question"
```

---

### Task 3: Retrieval tuning — default k=12, lower keyword weight (TDD)

**Files:**
- Modify: `src/lib/search/retrieve.ts`
- Test: `tests/integration/retrieve.test.ts` (add a case)

- [ ] **Step 1: Write the failing test**

Add this case inside the `describe('retrieve', …)` block in `tests/integration/retrieve.test.ts` (after the existing `it`):

```ts
  it('defaults to k=12 when no k is given', async () => {
    const [p] = await ctx.db.insert(ctx.schema.papers).values({ title: 'Bulk', status: 'ready' }).returning();
    const vec = Array(1536).fill(0); vec[0] = 1;
    const rows = Array.from({ length: 13 }, (_, i) => ({
      parentType: 'paper' as const, parentId: p.id, chunkIndex: i, text: `chunk ${i}`,
      embedding: vec, page: 1, charStart: i, charEnd: i + 1,
    }));
    await ctx.db.insert(ctx.schema.chunks).values(rows);
    const res = await retrieve('anything', fakeLLM(vec), ctx.db, { schema: ctx.schema }); // no k
    expect(res).toHaveLength(12);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/retrieve.test.ts`
Expected: FAIL — current default is `k = 8`, so the new case gets 8 rows, not 12.

- [ ] **Step 3: Make the tuning change**

In `src/lib/search/retrieve.ts`:

Change the default `k`:
```ts
  const k = opts.k ?? 12;
```
(was `opts.k ?? 8`)

And lower the full-text weight in the `orderBy` from `0.1` to `0.05` so semantic similarity leads:
```ts
    .orderBy(
      sql`(${schema.chunks.embedding} <=> ${vecLiteral}::vector) - 0.05 * ts_rank(to_tsvector('english', ${schema.chunks.text}), plainto_tsquery('english', ${query}))`,
    )
```
(was `- 0.1 * ts_rank(...)`)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/integration/retrieve.test.ts`
Expected: PASS (both the original case and the new k=12 case).

- [ ] **Step 5: Commit**

```bash
git add src/lib/search/retrieve.ts tests/integration/retrieve.test.ts
git commit -m "feat(search): default k=12 and lower keyword weight to 0.05"
```

---

### Task 4: Soften the answer prompt

**Files:**
- Modify: `src/lib/llm/openai.ts`

The system prompt string is in the real provider, which is not unit-tested in this repo (it would require mocking the OpenAI client). This is a reviewed text change; behavior is a manual-eval/quality concern. Keep the JSON contract and `citationIndexes` exactly as-is.

- [ ] **Step 1: Replace the system prompt**

In `src/lib/llm/openai.ts`, replace the `system` message content:

```ts
    const system: ChatMessage = {
      role: 'system',
      content:
        'You answer questions about a corpus of academic papers and literature reviews, using ' +
        'ONLY the numbered context passages. Synthesize and reason across the passages — connect ' +
        'related points, compare findings, and infer what they collectively support — to give a ' +
        'thorough, genuinely helpful answer. Do not use outside knowledge. Cite the passages you ' +
        'rely on by their bracket number. Only if the passages genuinely do not address the ' +
        'question, answer exactly "I could not find this in the corpus." ' +
        'Respond as strict JSON: {"answer": string, "citationIndexes": number[]}. ' +
        'citationIndexes lists the 1-based context passages you actually used.',
    };
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit` (no new `src/` errors beyond the ~23 pre-existing `tests/ui/*`) and `npx eslint src/lib/llm/openai.ts` (0 errors).

- [ ] **Step 3: Commit**

```bash
git add src/lib/llm/openai.ts
git commit -m "feat(chat): soften answer prompt to synthesize across passages (corpus-grounded)"
```

---

### Task 5: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full suite**

Run: `npx vitest run`
Expected: all green, including the new `rewrite` and `retrieve-rewrite` specs and the k=12 case. No regressions.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: only the pre-existing `tests/ui/*` errors (23 baseline); zero new in `src/`.

- [ ] **Step 3: Lint changed files**

Run: `npx eslint src/lib/chat/rewrite.ts src/lib/chat/answer.ts src/lib/search/retrieve.ts src/lib/llm/openai.ts`
Expected: 0 errors (the `any` Deps/db warnings, if any, match existing convention).

- [ ] **Step 4: Build**

Run: `npx next build`
Expected: succeeds.

- [ ] **Step 5: Update the backlog**

In `docs/BACKLOG.md`, mark BUG-6 done — note the history-aware rewrite, k=12 / weight 0.05, and the softened-but-grounded prompt. Commit:

```bash
git add docs/BACKLOG.md
git commit -m "docs: mark BUG-6 done (Phase 3b smarter retrieval)"
```

---

## Self-Review

**Spec coverage:**
- Query rewriting module (history-aware, expand, JSON `{query}`, fallback) → Task 1 ✓
- Wire into `answerQuestion` (retrieve on rewritten, answer original) → Task 2 ✓
- Retrieval tuning (k 8→12, weight 0.1→0.05) → Task 3 ✓
- Softened, still-grounded prompt → Task 4 ✓
- Tests: rewrite unit (incl. fallback), answerQuestion integration (rewritten-embedded / original-answered), k=12 case → Tasks 1–3 ✓
- Existing callers stay green via fallback → verified in Task 2 Step 4 ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code; Task 4 explains why there's no unit test (real-provider prompt string) rather than leaving a gap.

**Type consistency:** `rewriteSearchQuery(question: string, history: ChatMessage[], llm: LLMProvider): Promise<string>` is defined in Task 1 and called identically in Task 2. `AnswerOpts` keeps `history?: ChatMessage[]`. `retrieve` default `k` (Task 3) is the single source of the 12 default now that Task 2 passes `k: opts.k` through. The `orderBy` weight change matches the existing `sql` template exactly except the `0.1`→`0.05` constant.
