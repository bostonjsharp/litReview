import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { makeTestDb } from '../helpers/testdb';
import { addProseEntry, addAnnotationEntry, moveEntry, removeEntry, getReviewEntries } from '@/lib/reviews/service';

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => { ctx = await makeTestDb(); });
afterAll(async () => { await ctx.sql.end(); });

const deps = () => ({ db: ctx.db, schema: ctx.schema });

describe('review composition', () => {
  it('appends, reorders, and removes entries with contiguous positions', async () => {
    const [r] = await ctx.db.insert(ctx.schema.reviews).values({ title: 'R' }).returning();
    const [p] = await ctx.db.insert(ctx.schema.papers).values({ title: 'P', status: 'ready' }).returning();
    const [a] = await ctx.db.insert(ctx.schema.annotations).values({ paperId: p.id, charStart: 0, charEnd: 3, quote: 'q', comment: 'c' }).returning();

    await addProseEntry(r.id, 'intro', deps());
    await addAnnotationEntry(r.id, a.id, deps());
    await addProseEntry(r.id, 'outro', deps());

    let entries = await getReviewEntries(r.id, deps());
    expect(entries.map((e) => e.position)).toEqual([0, 1, 2]);
    expect(entries.map((e) => e.kind)).toEqual(['prose', 'annotation', 'prose']);

    await moveEntry(r.id, entries[2].id, 'up', deps());
    entries = await getReviewEntries(r.id, deps());
    expect(entries.map((e) => e.kind)).toEqual(['prose', 'prose', 'annotation']);

    await removeEntry(r.id, entries[0].id, deps());
    entries = await getReviewEntries(r.id, deps());
    expect(entries.map((e) => e.position)).toEqual([0, 1]);
  });
});
