import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { makeTestDb } from '../helpers/testdb';
import { retrieve } from '@/lib/search/retrieve';

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => { ctx = await makeTestDb(); });
afterAll(async () => { await ctx.sql.end(); });

describe('retrieve (annotation chunks)', () => {
  it('resolves an annotation chunk to "Note on <paper title>"', async () => {
    const [p] = await ctx.db.insert(ctx.schema.papers).values({ title: 'Attention', status: 'ready' }).returning();
    const [a] = await ctx.db.insert(ctx.schema.annotations).values({ paperId: p.id, charStart: 0, charEnd: 3, quote: 'x', comment: 'key insight', page: 5 }).returning();
    const vec = Array(1536).fill(0); vec[0] = 1;
    await ctx.db.insert(ctx.schema.chunks).values({ parentType: 'annotation', parentId: a.id, chunkIndex: 0, text: 'key insight', embedding: vec, page: 5, charStart: 0, charEnd: 3 });
    const llm = { embed: vi.fn(async () => [vec]), chat: vi.fn() } as any;
    const res = await retrieve('insight', llm, ctx.db, { k: 1, schema: ctx.schema });
    expect(res).toHaveLength(1);
    expect(res[0].source).toMatchObject({ parentType: 'annotation', parentId: a.id, title: 'Note on Attention', page: 5 });
  });
});
