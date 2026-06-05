import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { makeTestDb } from '../helpers/testdb';
import { createTheme, listThemes, deleteTheme, tagAnnotation, untagAnnotation, getMatrix } from '@/lib/themes/service';
import { addPaperToCollection } from '@/lib/papers/collections';

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => { ctx = await makeTestDb(); });
afterAll(async () => { await ctx.sql.end(); });
const deps = () => ({ db: ctx.db, schema: ctx.schema });

async function setup() {
  const [c] = await ctx.db.insert(ctx.schema.collections).values({ name: 'C' }).returning();
  const [p1] = await ctx.db.insert(ctx.schema.papers).values({ collectionId: c.id, title: 'A', status: 'ready' }).returning();
  const [p2] = await ctx.db.insert(ctx.schema.papers).values({ collectionId: c.id, title: 'B', status: 'ready' }).returning();
  // Register memberships so that getMatrix/tagAnnotation can find these papers via junction
  await addPaperToCollection(p1.id, c.id, { db: ctx.db, schema: ctx.schema });
  await addPaperToCollection(p2.id, c.id, { db: ctx.db, schema: ctx.schema });
  const [a1] = await ctx.db.insert(ctx.schema.annotations).values({ paperId: p1.id, charStart: 0, charEnd: 3, quote: 'q1', comment: 'c1', page: 1 }).returning();
  const [a2] = await ctx.db.insert(ctx.schema.annotations).values({ paperId: p2.id, charStart: 0, charEnd: 3, quote: 'q2', comment: 'c2', page: 2 }).returning();
  return { c, p1, p2, a1, a2 };
}

describe('theme service', () => {
  it('creates, lists, tags, and builds a matrix; untags and deletes', async () => {
    const { c, p1, p2, a1, a2 } = await setup();
    const t = await createTheme(c.id, 'Method', null, deps());
    expect((await listThemes(c.id, deps())).map((x: { name: string }) => x.name)).toEqual(['Method']);

    await tagAnnotation(a1.id, t.id, deps());
    await tagAnnotation(a1.id, t.id, deps()); // idempotent
    await tagAnnotation(a2.id, t.id, deps());

    const m = await getMatrix(c.id, deps());
    expect(m.papers.map((x) => x.id).sort()).toEqual([p1.id, p2.id].sort());
    expect(m.themes.map((x) => x.name)).toEqual(['Method']);
    expect(m.cells[p1.id][t.id].map((x) => x.quote)).toEqual(['q1']);
    expect(m.cells[p2.id][t.id].map((x) => x.quote)).toEqual(['q2']);

    await untagAnnotation(a1.id, t.id, deps());
    const m2 = await getMatrix(c.id, deps());
    expect(m2.cells[p1.id]?.[t.id]).toBeUndefined();

    await deleteTheme(t.id, deps());
    expect(await listThemes(c.id, deps())).toHaveLength(0);
  });

  it('rejects tagging with a theme from another collection', async () => {
    const { a1 } = await setup();
    const [other] = await ctx.db.insert(ctx.schema.collections).values({ name: 'Other' }).returning();
    const t = await createTheme(other.id, 'X', null, deps());
    await expect(tagAnnotation(a1.id, t.id, deps())).rejects.toThrow();
  });

  it('a reused paper can be tagged and matrixed in the collection it was added to', async () => {
    // Paper's home collectionId is A, but it is reused into B via addPaperToCollection
    const [a] = await ctx.db.insert(ctx.schema.collections).values({ name: 'A-home' }).returning();
    const [b] = await ctx.db.insert(ctx.schema.collections).values({ name: 'B-reuse' }).returning();
    const [p] = await ctx.db.insert(ctx.schema.papers).values({ collectionId: a.id, title: 'Reused', status: 'ready' }).returning();
    const [ann] = await ctx.db.insert(ctx.schema.annotations).values({ paperId: p.id, charStart: 0, charEnd: 3, quote: 'rq', comment: 'rc', page: 1 }).returning();
    // Link paper into collection B (membership, not changing home)
    await addPaperToCollection(p.id, b.id, deps());
    // Create a theme in B and tag the annotation — must NOT throw
    const t = await createTheme(b.id, 'Reuse-Theme', null, deps());
    await expect(tagAnnotation(ann.id, t.id, deps())).resolves.not.toThrow();
    // getMatrix(B) must include the reused paper
    const m = await getMatrix(b.id, deps());
    expect(m.papers.map((x) => x.id)).toContain(p.id);
    expect(m.cells[p.id][t.id].map((x) => x.quote)).toContain('rq');
  });
});
