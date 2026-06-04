import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { makeTestDb } from '../helpers/testdb';
import { answerQuestion } from '@/lib/chat/answer';
import type { ChatMessage } from '@/lib/llm/types';

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => { ctx = await makeTestDb(); });
afterAll(async () => { await ctx.sql.end(); });

describe('answerQuestion with rewrite', () => {
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
});
