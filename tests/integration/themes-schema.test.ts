import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from '../helpers/testdb';

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => { ctx = await makeTestDb(); });
afterAll(async () => { await ctx.sql.end(); });

describe('themes schema', () => {
  it('tags an annotation with a theme and cascades on theme delete', async () => {
    const [c] = await ctx.db.insert(ctx.schema.collections).values({ name: 'C' }).returning();
    const [p] = await ctx.db.insert(ctx.schema.papers).values({ collectionId: c.id, title: 'P', status: 'ready' }).returning();
    const [a] = await ctx.db.insert(ctx.schema.annotations).values({ paperId: p.id, charStart: 0, charEnd: 3, quote: 'q', comment: 'note' }).returning();
    const [t] = await ctx.db.insert(ctx.schema.themes).values({ collectionId: c.id, name: 'Method' }).returning();
    await ctx.db.insert(ctx.schema.annotationThemes).values({ annotationId: a.id, themeId: t.id });
    let links = await ctx.db.select().from(ctx.schema.annotationThemes).where(eq(ctx.schema.annotationThemes.annotationId, a.id));
    expect(links).toHaveLength(1);
    await ctx.db.delete(ctx.schema.themes).where(eq(ctx.schema.themes.id, t.id));
    links = await ctx.db.select().from(ctx.schema.annotationThemes).where(eq(ctx.schema.annotationThemes.annotationId, a.id));
    expect(links).toHaveLength(0);
  });
});
