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
