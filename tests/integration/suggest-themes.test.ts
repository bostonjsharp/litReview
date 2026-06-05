import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { makeTestDb } from '../helpers/testdb';
import { suggestThemes } from '@/lib/themes/service';
import { addPaperToCollection } from '@/lib/papers/collections';

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => { ctx = await makeTestDb(); });
afterAll(async () => { await ctx.sql.end(); });

describe('suggestThemes', () => {
  it('feeds collection annotations to complete() and returns parsed suggestions without writing', async () => {
    const [c] = await ctx.db.insert(ctx.schema.collections).values({ name: 'C' }).returning();
    const [p] = await ctx.db.insert(ctx.schema.papers).values({ collectionId: c.id, title: 'P', status: 'ready' }).returning();
    await addPaperToCollection(p.id, c.id, { db: ctx.db, schema: ctx.schema });
    const [a] = await ctx.db.insert(ctx.schema.annotations).values({ paperId: p.id, charStart: 0, charEnd: 3, quote: 'q', comment: 'about methods' }).returning();

    const complete = vi.fn(async (prompt: string) => {
      expect(prompt).toContain(a.id);
      return JSON.stringify({ themes: ['Method'], assignments: [{ annotationId: a.id, themes: ['Method'] }] });
    });
    const llm = { embed: vi.fn(), chat: vi.fn(), complete } as any;

    const suggestion = await suggestThemes(c.id, { db: ctx.db, schema: ctx.schema, llm });
    expect(suggestion.themes).toEqual(['Method']);
    expect(suggestion.assignments[0].annotationId).toBe(a.id);

    expect(await ctx.db.select().from(ctx.schema.themes)).toHaveLength(0);
    expect(await ctx.db.select().from(ctx.schema.annotationThemes)).toHaveLength(0);
  });
});
