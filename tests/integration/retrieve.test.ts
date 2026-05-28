import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { makeTestDb } from '../helpers/testdb';
import { retrieve } from '@/lib/search/retrieve';

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => {
  ctx = await makeTestDb();
});
afterAll(async () => {
  await ctx.sql.end();
});

function fakeLLM(queryVec: number[]) {
  return { embed: vi.fn(async () => [queryVec]), chat: vi.fn() } as any;
}

describe('retrieve', () => {
  it('returns the most similar chunk first with a usable source', async () => {
    const [p] = await ctx.db.insert(ctx.schema.papers).values({ title: 'Attention Paper', status: 'ready' }).returning();
    const near = Array(1536).fill(0);
    near[0] = 1;
    const far = Array(1536).fill(0);
    far[1] = 1;
    await ctx.db.insert(ctx.schema.chunks).values([
      { parentType: 'paper', parentId: p.id, chunkIndex: 0, text: 'about transformers', embedding: near, page: 1, charStart: 0, charEnd: 18 },
      { parentType: 'paper', parentId: p.id, chunkIndex: 1, text: 'about cooking', embedding: far, page: 2, charStart: 18, charEnd: 31 },
    ]);
    const res = await retrieve('transformers', fakeLLM(near), ctx.db, { k: 1, schema: ctx.schema });
    expect(res).toHaveLength(1);
    expect(res[0].text).toBe('about transformers');
    expect(res[0].source).toMatchObject({ parentType: 'paper', parentId: p.id, title: 'Attention Paper', page: 1 });
  });
});
