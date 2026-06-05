import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { makeTestDb } from '../helpers/testdb';
import {
  addPaperToCollection, removePaperFromCollection, collectionPaperIds,
  paperCollectionIds, isPaperInCollection, listWorkspacePapers,
} from '@/lib/papers/collections';

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => { ctx = await makeTestDb(); });
afterAll(async () => { await ctx.sql.end(); });
function deps() { return { db: ctx.db, schema: ctx.schema }; }

async function seed() {
  const [w] = await ctx.db.insert(ctx.schema.workspaces).values({ name: 'W', inviteCode: `c${Math.random()}` }).returning();
  const [a] = await ctx.db.insert(ctx.schema.collections).values({ name: 'A', workspaceId: w.id }).returning();
  const [b] = await ctx.db.insert(ctx.schema.collections).values({ name: 'B', workspaceId: w.id }).returning();
  const [p] = await ctx.db.insert(ctx.schema.papers).values({ title: 'P', status: 'ready', workspaceId: w.id }).returning();
  return { w, a, b, p };
}

describe('paper-collections membership', () => {
  it('adds idempotently and reports membership both ways', async () => {
    const { a, b, p } = await seed();
    await addPaperToCollection(p.id, a.id, deps());
    await addPaperToCollection(p.id, a.id, deps()); // idempotent — no throw
    await addPaperToCollection(p.id, b.id, deps());
    expect((await paperCollectionIds(p.id, deps())).sort()).toEqual([a.id, b.id].sort());
    expect(await collectionPaperIds(a.id, deps())).toContain(p.id);
    expect(await isPaperInCollection(p.id, b.id, deps())).toBe(true);
  });

  it('removes a link without deleting the paper', async () => {
    const { a, p } = await seed();
    await addPaperToCollection(p.id, a.id, deps());
    await removePaperFromCollection(p.id, a.id, deps());
    expect(await isPaperInCollection(p.id, a.id, deps())).toBe(false);
    // the paper row still exists (unlink ≠ delete):
    const rows = await ctx.db.select().from(ctx.schema.papers);
    expect(rows.some((r: { id: string }) => r.id === p.id)).toBe(true);
  });

  it('lists workspace papers with their collection ids', async () => {
    const { w, a, p } = await seed();
    await addPaperToCollection(p.id, a.id, deps());
    const list = await listWorkspacePapers(w.id, deps());
    const found = list.find((x: any) => x.id === p.id);
    expect(found).toBeTruthy();
    expect(found.collectionIds).toContain(a.id);
  });
});
