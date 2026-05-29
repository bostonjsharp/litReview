import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { makeTestDb } from '../helpers/testdb';
import { retrieve } from '@/lib/search/retrieve';

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => { ctx = await makeTestDb(); });
afterAll(async () => { await ctx.sql.end(); });

describe('workspace-scoped retrieval', () => {
  it('only returns chunks from the requested workspace', async () => {
    const [u] = await ctx.db.insert(ctx.schema.users).values({ email: 'a@x.edu' }).returning();
    const [w1] = await ctx.db.insert(ctx.schema.workspaces).values({ name: 'W1', ownerId: u.id, inviteCode: 'c1' }).returning();
    const [w2] = await ctx.db.insert(ctx.schema.workspaces).values({ name: 'W2', ownerId: u.id, inviteCode: 'c2' }).returning();
    const [p1] = await ctx.db.insert(ctx.schema.papers).values({ title: 'P1', status: 'ready', workspaceId: w1.id }).returning();
    const [p2] = await ctx.db.insert(ctx.schema.papers).values({ title: 'P2', status: 'ready', workspaceId: w2.id }).returning();
    const vec = Array(1536).fill(0); vec[0] = 1;
    await ctx.db.insert(ctx.schema.chunks).values([
      { parentType: 'paper', parentId: p1.id, workspaceId: w1.id, chunkIndex: 0, text: 'secret one', embedding: vec, page: 1, charStart: 0, charEnd: 10 },
      { parentType: 'paper', parentId: p2.id, workspaceId: w2.id, chunkIndex: 0, text: 'secret two', embedding: vec, page: 1, charStart: 0, charEnd: 10 },
    ]);
    const llm = { embed: vi.fn(async () => [vec]), chat: vi.fn(), complete: vi.fn() } as any;
    const res = await retrieve('secret', llm, ctx.db, { schema: ctx.schema, scope: { workspaceId: w1.id } });
    expect(res).toHaveLength(1);
    expect(res[0].text).toBe('secret one');
  });
});
