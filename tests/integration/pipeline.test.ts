import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from '../helpers/testdb';
import { processDocument } from '@/lib/ingest/pipeline';

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => {
  ctx = await makeTestDb();
});
afterAll(async () => {
  await ctx.sql.end();
});

function fakeLLM() {
  return {
    embed: vi.fn(async (texts: string[]) => texts.map(() => Array(1536).fill(0.01))),
    chat: vi.fn(async () => ({ answer: '{}', citations: [] })),
  };
}

describe('processDocument', () => {
  it('extracts, chunks, embeds, and marks a paper ready', async () => {
    const [p] = await ctx.db.insert(ctx.schema.papers).values({ status: 'pending' }).returning();
    const llm = fakeLLM();
    await processDocument(
      { parentType: 'paper', parentId: p.id, pastedText: 'Neural networks are great. '.repeat(500) },
      { db: ctx.db, schema: ctx.schema, llm },
    );
    const [updated] = await ctx.db.select().from(ctx.schema.papers).where(eq(ctx.schema.papers.id, p.id));
    expect(updated.status).toBe('ready');
    expect(updated.fullText).toContain('Neural networks');
    const rows = await ctx.db.select().from(ctx.schema.chunks).where(eq(ctx.schema.chunks.parentId, p.id));
    expect(rows.length).toBeGreaterThan(0);
    expect(llm.embed).toHaveBeenCalled();
  });

  it('marks failed with a reason when text cannot be produced', async () => {
    const [p] = await ctx.db.insert(ctx.schema.papers).values({ status: 'pending' }).returning();
    await processDocument(
      { parentType: 'paper', parentId: p.id, pastedText: '   ' },
      { db: ctx.db, schema: ctx.schema, llm: fakeLLM() },
    );
    const [updated] = await ctx.db.select().from(ctx.schema.papers).where(eq(ctx.schema.papers.id, p.id));
    expect(updated.status).toBe('failed');
    expect(updated.errorReason).toBeTruthy();
  });
});
