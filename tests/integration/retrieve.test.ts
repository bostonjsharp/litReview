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

  it('carries charStart and paperId on a paper-chunk source', async () => {
    const [p] = await ctx.db.insert(ctx.schema.papers).values({ title: 'Loc', status: 'ready' }).returning();
    const vec = Array(1536).fill(0); vec[2] = 1; // unique dimension → deterministically nearest
    await ctx.db.insert(ctx.schema.chunks).values({
      parentType: 'paper', parentId: p.id, chunkIndex: 0, text: 'located text',
      embedding: vec, page: 1, charStart: 42, charEnd: 54,
    });
    const res = await retrieve('q', fakeLLM(vec), ctx.db, { k: 1, schema: ctx.schema });
    expect(res[0].source.charStart).toBe(42);
    expect(res[0].source.paperId).toBe(p.id);
  });

  it('sets paperId to the containing paper for a note chunk', async () => {
    const [p] = await ctx.db.insert(ctx.schema.papers).values({ title: 'Host', status: 'ready' }).returning();
    const [a] = await ctx.db.insert(ctx.schema.annotations).values({ paperId: p.id, charStart: 0, charEnd: 4, quote: 'x', comment: 'y' }).returning();
    const vec = Array(1536).fill(0); vec[3] = 1; // unique dimension
    await ctx.db.insert(ctx.schema.chunks).values({
      parentType: 'annotation', parentId: a.id, chunkIndex: 0, text: 'note text',
      embedding: vec, page: 1, charStart: 0, charEnd: 9,
    });
    const res = await retrieve('q', fakeLLM(vec), ctx.db, { k: 1, schema: ctx.schema });
    expect(res[0].source.parentType).toBe('annotation');
    expect(res[0].source.paperId).toBe(p.id);
  });
});
