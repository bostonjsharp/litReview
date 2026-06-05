import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from '../helpers/testdb';
import { deletePaper } from '@/lib/papers/service';

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => { ctx = await makeTestDb(); });
afterAll(async () => { await ctx.sql.end(); });
function deps() { return { db: ctx.db, schema: ctx.schema }; }

describe('deletePaper', () => {
  it('removes the paper, its annotations, its collection memberships, and all its chunks', async () => {
    const [w] = await ctx.db.insert(ctx.schema.workspaces).values({ name: 'W', inviteCode: `c${Math.random()}` }).returning();
    const [c] = await ctx.db.insert(ctx.schema.collections).values({ name: 'C', workspaceId: w.id }).returning();
    const [p] = await ctx.db.insert(ctx.schema.papers).values({ title: 'P', status: 'ready', workspaceId: w.id, collectionId: c.id }).returning();
    await ctx.db.insert(ctx.schema.paperCollections).values({ paperId: p.id, collectionId: c.id });
    const [a] = await ctx.db.insert(ctx.schema.annotations).values({ paperId: p.id, charStart: 0, charEnd: 4, quote: 'q', comment: 'x' }).returning();
    const vec = Array(1536).fill(0);
    await ctx.db.insert(ctx.schema.chunks).values([
      { parentType: 'paper', parentId: p.id, chunkIndex: 0, text: 't', embedding: vec, charStart: 0, charEnd: 1 },
      { parentType: 'annotation', parentId: a.id, chunkIndex: 0, text: 'n', embedding: vec, charStart: 0, charEnd: 1 },
    ]);

    await deletePaper(p.id, deps());

    expect(await ctx.db.select().from(ctx.schema.papers).where(eq(ctx.schema.papers.id, p.id))).toHaveLength(0);
    expect(await ctx.db.select().from(ctx.schema.annotations).where(eq(ctx.schema.annotations.id, a.id))).toHaveLength(0);
    expect(await ctx.db.select().from(ctx.schema.paperCollections).where(eq(ctx.schema.paperCollections.paperId, p.id))).toHaveLength(0);
    const chunks = await ctx.db.select().from(ctx.schema.chunks);
    expect(chunks.filter((ch: { parentId: string }) => ch.parentId === p.id || ch.parentId === a.id)).toHaveLength(0);
  });
});
