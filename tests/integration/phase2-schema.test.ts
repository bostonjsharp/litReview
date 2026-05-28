import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from '../helpers/testdb';

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => { ctx = await makeTestDb(); });
afterAll(async () => { await ctx.sql.end(); });

describe('phase 2 schema', () => {
  it('stores an annotation and a review entry referencing it', async () => {
    const [p] = await ctx.db.insert(ctx.schema.papers).values({ title: 'P', status: 'ready' }).returning();
    const [a] = await ctx.db.insert(ctx.schema.annotations).values({ paperId: p.id, charStart: 0, charEnd: 5, quote: 'hello', comment: 'note' }).returning();
    const [r] = await ctx.db.insert(ctx.schema.reviews).values({ title: 'R' }).returning();
    const [e] = await ctx.db.insert(ctx.schema.reviewEntries).values({ reviewId: r.id, position: 0, kind: 'annotation', annotationId: a.id }).returning();
    expect(a.quote).toBe('hello');
    expect(e.kind).toBe('annotation');
    // cascade: deleting the annotation removes the referencing entry
    await ctx.db.delete(ctx.schema.annotations).where(eq(ctx.schema.annotations.id, a.id));
    const entries = await ctx.db.select().from(ctx.schema.reviewEntries).where(eq(ctx.schema.reviewEntries.reviewId, r.id));
    expect(entries).toHaveLength(0);
  });
});
