import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from '../helpers/testdb';
import { processDocument } from '@/lib/ingest/pipeline';
import { answerQuestion } from '@/lib/chat/answer';

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => {
  ctx = await makeTestDb();
});
afterAll(async () => {
  await ctx.sql.end();
});

describe('upload → process → chat flow', () => {
  it('an ingested paper becomes answerable', async () => {
    const [p] = await ctx.db.insert(ctx.schema.papers).values({ title: 'RNN vs Transformer', status: 'pending' }).returning();
    const vec = Array(1536).fill(0);
    vec[0] = 1;
    const llm = {
      embed: vi.fn(async (texts: string[]) => texts.map(() => vec)),
      chat: vi.fn(async (_m: unknown, ctxChunks: any[]) => ({ answer: 'Transformers win.', citations: ctxChunks.map((c) => ({ ...c.source })) })),
    } as any;
    await processDocument(
      { parentType: 'paper', parentId: p.id, pastedText: 'Transformers outperform RNNs on long sequences. '.repeat(50) },
      { db: ctx.db, schema: ctx.schema, llm },
    );
    const [ready] = await ctx.db.select().from(ctx.schema.papers).where(eq(ctx.schema.papers.id, p.id));
    expect(ready.status).toBe('ready');
    const res = await answerQuestion('Which is better?', llm, ctx.db, { schema: ctx.schema });
    expect(res.answer).toBe('Transformers win.');
    expect(res.citations[0].title).toBe('RNN vs Transformer');
  });

  it('an uploaded review is processed to ready (so "stuck pending" is a UI-polling gap, not a pipeline bug)', async () => {
    const [r] = await ctx.db.insert(ctx.schema.reviews).values({ title: 'Survey', status: 'pending' }).returning();
    const llm = { embed: vi.fn(async (texts: string[]) => texts.map(() => Array(1536).fill(0))), chat: vi.fn() } as any;
    await processDocument(
      { parentType: 'review', parentId: r.id, pastedText: 'A synthesis of the field. '.repeat(50) },
      { db: ctx.db, schema: ctx.schema, llm },
    );
    const [done] = await ctx.db.select().from(ctx.schema.reviews).where(eq(ctx.schema.reviews.id, r.id));
    expect(done.status).toBe('ready');
    expect(done.bodyText).toContain('synthesis');
  });
});
