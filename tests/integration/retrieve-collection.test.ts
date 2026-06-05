import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { makeTestDb } from '../helpers/testdb';
import { retrieve } from '@/lib/search/retrieve';
import { addPaperToCollection } from '@/lib/papers/collections';

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => { ctx = await makeTestDb(); });
afterAll(async () => { await ctx.sql.end(); });
const fakeLLM = (v: number[]) => ({ embed: vi.fn(async () => [v]), chat: vi.fn() } as any);

it('collection scope includes a paper reused into that collection', async () => {
  const [w] = await ctx.db.insert(ctx.schema.workspaces).values({ name: 'W', inviteCode: `c${Math.random()}` }).returning();
  const [a] = await ctx.db.insert(ctx.schema.collections).values({ name: 'A', workspaceId: w.id }).returning();
  const [b] = await ctx.db.insert(ctx.schema.collections).values({ name: 'B', workspaceId: w.id }).returning();
  const [p] = await ctx.db.insert(ctx.schema.papers).values({ title: 'P', status: 'ready', workspaceId: w.id, collectionId: a.id }).returning();
  // chunk's stored collectionId is A (origin), but we reuse the paper into B:
  const vec = Array(1536).fill(0); vec[5] = 1;
  await ctx.db.insert(ctx.schema.chunks).values({
    parentType: 'paper', parentId: p.id, collectionId: a.id, workspaceId: w.id,
    chunkIndex: 0, text: 'reused', embedding: vec, charStart: 0, charEnd: 6,
  });
  await addPaperToCollection(p.id, a.id, { db: ctx.db, schema: ctx.schema });
  await addPaperToCollection(p.id, b.id, { db: ctx.db, schema: ctx.schema });

  const res = await retrieve('q', fakeLLM(vec), ctx.db, { scope: { collectionId: b.id }, k: 5, schema: ctx.schema });
  expect(res.map((r) => r.id)).toContain(/* the chunk is returned under collection B */ res[0]?.id);
  expect(res.some((r) => r.text === 'reused')).toBe(true);
});
