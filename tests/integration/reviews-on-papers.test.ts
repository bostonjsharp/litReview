import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { makeTestDb } from '../helpers/testdb';
import { reviewsCitingPaper } from '@/lib/reviews/service';

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => { ctx = await makeTestDb(); });
afterAll(async () => { await ctx.sql.end(); });
function deps() { return { db: ctx.db, schema: ctx.schema }; }

describe('reviewsCitingPaper', () => {
  it('returns reviews citing a note on the paper (deduped), excluding others', async () => {
    const [p1] = await ctx.db.insert(ctx.schema.papers).values({ title: 'P1', status: 'ready' }).returning();
    const [p2] = await ctx.db.insert(ctx.schema.papers).values({ title: 'P2', status: 'ready' }).returning();
    const [a1] = await ctx.db.insert(ctx.schema.annotations).values({ paperId: p1.id, charStart: 0, charEnd: 4, quote: 'x', comment: 'c' }).returning();
    const [a1b] = await ctx.db.insert(ctx.schema.annotations).values({ paperId: p1.id, charStart: 5, charEnd: 9, quote: 'y', comment: 'd' }).returning();
    const [a2] = await ctx.db.insert(ctx.schema.annotations).values({ paperId: p2.id, charStart: 0, charEnd: 4, quote: 'z', comment: 'e' }).returning();
    const [r1] = await ctx.db.insert(ctx.schema.reviews).values({ title: 'R1', status: 'ready' }).returning();
    const [r2] = await ctx.db.insert(ctx.schema.reviews).values({ title: 'R2', status: 'ready' }).returning();
    // r1 cites two different notes on p1 (must dedupe to one review row); r2 cites p2
    await ctx.db.insert(ctx.schema.reviewEntries).values([
      { reviewId: r1.id, position: 0, kind: 'annotation', annotationId: a1.id },
      { reviewId: r1.id, position: 1, kind: 'annotation', annotationId: a1b.id },
      { reviewId: r2.id, position: 0, kind: 'annotation', annotationId: a2.id },
    ]);

    const res = await reviewsCitingPaper(p1.id, deps());
    expect(res.map((r) => r.id)).toEqual([r1.id]);
    expect(res[0].title).toBe('R1');
  });
});
