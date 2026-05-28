import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { makeTestDb } from '../helpers/testdb';
import { embedAnnotation } from '@/lib/annotate/embed';

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => { ctx = await makeTestDb(); });
afterAll(async () => { await ctx.sql.end(); });

function fakeLLM() {
  return { embed: vi.fn(async (t: string[]) => t.map(() => Array(1536).fill(0.02))), chat: vi.fn() } as any;
}

async function annChunks(annotationId: string) {
  return ctx.db
    .select()
    .from(ctx.schema.chunks)
    .where(and(eq(ctx.schema.chunks.parentType, 'annotation'), eq(ctx.schema.chunks.parentId, annotationId)));
}

describe('embedAnnotation', () => {
  it('creates exactly one chunk and re-embeds idempotently', async () => {
    const [p] = await ctx.db.insert(ctx.schema.papers).values({ title: 'P', status: 'ready' }).returning();
    const [a] = await ctx.db.insert(ctx.schema.annotations).values({ paperId: p.id, charStart: 0, charEnd: 4, quote: 'quo', comment: 'note', page: 2 }).returning();
    const deps = { db: ctx.db, schema: ctx.schema, llm: fakeLLM() };
    await embedAnnotation(a.id, deps);
    let rows = await annChunks(a.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].text).toBe('quo\nnote');
    expect(rows[0].page).toBe(2);
    await embedAnnotation(a.id, deps);
    rows = await annChunks(a.id);
    expect(rows).toHaveLength(1);
  });

  it('removes the chunk when quote and comment are both blank', async () => {
    const [p] = await ctx.db.insert(ctx.schema.papers).values({ title: 'P', status: 'ready' }).returning();
    const [a] = await ctx.db.insert(ctx.schema.annotations).values({ paperId: p.id, charStart: 0, charEnd: 4, quote: 'q', comment: 'c' }).returning();
    const deps = { db: ctx.db, schema: ctx.schema, llm: fakeLLM() };
    await embedAnnotation(a.id, deps);
    expect(await annChunks(a.id)).toHaveLength(1);
    await ctx.db.update(ctx.schema.annotations).set({ quote: '', comment: '' }).where(eq(ctx.schema.annotations.id, a.id));
    await embedAnnotation(a.id, deps);
    expect(await annChunks(a.id)).toHaveLength(0);
  });
});
