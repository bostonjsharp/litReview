import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { makeTestDb } from '../helpers/testdb';
import { answerQuestion } from '@/lib/chat/answer';

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => {
  ctx = await makeTestDb();
});
afterAll(async () => {
  await ctx.sql.end();
});

describe('answerQuestion', () => {
  it('retrieves context and returns an answer with citations', async () => {
    const [p] = await ctx.db.insert(ctx.schema.papers).values({ title: 'Smith 2020', status: 'ready' }).returning();
    const vec = Array(1536).fill(0);
    vec[0] = 1;
    await ctx.db.insert(ctx.schema.chunks).values([
      { parentType: 'paper', parentId: p.id, chunkIndex: 0, text: 'Transformers outperform RNNs.', embedding: vec, page: 4, charStart: 0, charEnd: 28 },
    ]);
    const llm = {
      embed: vi.fn(async () => [vec]),
      chat: vi.fn(async (_msgs: unknown, context: any[]) => ({ answer: 'Transformers outperform RNNs.', citations: context.map((c) => ({ ...c.source })) })),
    } as any;
    const res = await answerQuestion('Do transformers beat RNNs?', llm, ctx.db, { schema: ctx.schema });
    expect(res.answer).toContain('Transformers');
    expect(res.citations[0]).toMatchObject({ title: 'Smith 2020', page: 4 });
    expect(llm.chat).toHaveBeenCalled();
  });
});
