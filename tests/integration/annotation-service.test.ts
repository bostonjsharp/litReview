import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { makeTestDb } from '../helpers/testdb';
import { createAnnotation, updateAnnotation, deleteAnnotation } from '@/lib/annotate/service';

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => { ctx = await makeTestDb(); });
afterAll(async () => { await ctx.sql.end(); });

function deps() {
  return { db: ctx.db, schema: ctx.schema, llm: { embed: vi.fn(async (t: string[]) => t.map(() => Array(1536).fill(0.03))), chat: vi.fn() } as any };
}
const annChunks = (id: string) =>
  ctx.db.select().from(ctx.schema.chunks).where(and(eq(ctx.schema.chunks.parentType, 'annotation'), eq(ctx.schema.chunks.parentId, id)));

describe('annotation service', () => {
  it('creates an annotation, derives page from stored offsets, and embeds it', async () => {
    const [p] = await ctx.db.insert(ctx.schema.papers).values({ title: 'P', status: 'ready', pageOffsets: [0, 10, 20] }).returning();
    const ann = await createAnnotation({ paperId: p.id, createdBy: null, charStart: 12, charEnd: 16, quote: 'word', comment: 'note' }, deps());
    expect(ann.page).toBe(2); // offset 12 falls in page 2 (>=10, <20)
    expect(await annChunks(ann.id)).toHaveLength(1);
  });

  it('persists and returns the annotation even when embedding fails', async () => {
    const [p] = await ctx.db.insert(ctx.schema.papers).values({ title: 'P', status: 'ready', pageOffsets: [0] }).returning();
    const failing = {
      db: ctx.db,
      schema: ctx.schema,
      llm: { embed: vi.fn(async () => { throw new Error('embedding service unavailable'); }), chat: vi.fn() } as any,
    };
    // The note is the user's data — a flaky embedding call must never lose it or surface as a save failure.
    const ann = await createAnnotation(
      { paperId: p.id, createdBy: null, charStart: 0, charEnd: 4, quote: 'word', comment: 'note' },
      failing,
    );
    const rows = await ctx.db.select().from(ctx.schema.annotations).where(eq(ctx.schema.annotations.id, ann.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].comment).toBe('note');
    // No chunk yet (embedding failed) — but the annotation is safe and re-embeds on next edit.
    expect(await annChunks(ann.id)).toHaveLength(0);
  });

  it('rejects an invalid range', async () => {
    const [p] = await ctx.db.insert(ctx.schema.papers).values({ title: 'P', status: 'ready' }).returning();
    await expect(createAnnotation({ paperId: p.id, createdBy: null, charStart: 5, charEnd: 5, quote: '', comment: 'x' }, deps())).rejects.toThrow();
  });

  it('updates the comment and re-embeds; delete removes annotation and chunk', async () => {
    const [p] = await ctx.db.insert(ctx.schema.papers).values({ title: 'P', status: 'ready' }).returning();
    const ann = await createAnnotation({ paperId: p.id, createdBy: null, charStart: 0, charEnd: 4, quote: 'quo', comment: 'old' }, deps());
    const updated = await updateAnnotation(ann.id, 'new note', deps());
    expect(updated.comment).toBe('new note');
    const [chunk] = await annChunks(ann.id);
    expect(chunk.text).toBe('quo\nnew note');
    await deleteAnnotation(ann.id, deps());
    expect(await annChunks(ann.id)).toHaveLength(0);
    const rows = await ctx.db.select().from(ctx.schema.annotations).where(eq(ctx.schema.annotations.id, ann.id));
    expect(rows).toHaveLength(0);
  });
});
