import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { makeTestDb } from '../helpers/testdb';
import { createImportedPaper, processImportedPdf } from '@/lib/ingest/import-source';

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
    complete: vi.fn(async () => '{}'),
  };
}

async function samplePdfBytes(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([300, 200]);
  page.drawText('Transformers outperform RNNs on long sequences.', { x: 20, y: 150, size: 10, font });
  return doc.save();
}

describe('createImportedPaper', () => {
  it('writes a metadata_only stub when there is no pdf url', async () => {
    const { id, status } = await createImportedPaper(
      {
        workspaceId: null,
        collectionId: null,
        userId: null,
        metadata: { title: 'Stub Paper', authors: ['A. Author'], year: 2021, journal: 'arXiv' },
        pdfUrl: null,
      },
      { db: ctx.db, schema: ctx.schema },
    );
    expect(status).toBe('metadata_only');
    const [row] = await ctx.db.select().from(ctx.schema.papers).where(eq(ctx.schema.papers.id, id));
    expect(row.status).toBe('metadata_only');
    expect(row.title).toBe('Stub Paper');
    expect(row.authors).toEqual(['A. Author']);
    expect(row.year).toBe(2021);
  });

  it('inserts a pending row when a pdf url is available', async () => {
    const { id, status } = await createImportedPaper(
      {
        workspaceId: null,
        collectionId: null,
        userId: null,
        metadata: { title: 'Full Text Paper', doi: '10.1/z' },
        pdfUrl: 'https://oa.example/z.pdf',
      },
      { db: ctx.db, schema: ctx.schema },
    );
    expect(status).toBe('pending');
    const [row] = await ctx.db.select().from(ctx.schema.papers).where(eq(ctx.schema.papers.id, id));
    expect(row.status).toBe('pending');
    expect(row.title).toBe('Full Text Paper');
    expect(row.doi).toBe('10.1/z');
  });
});

describe('processImportedPdf', () => {
  it('downloads, stores to blob, ingests, and marks ready using injected metadata', async () => {
    const [p] = await ctx.db.insert(ctx.schema.papers).values({ status: 'pending' }).returning();
    const bytes = await samplePdfBytes();
    const fetchFn = vi.fn(async () => ({ ok: true, arrayBuffer: async () => bytes.buffer })) as unknown as typeof fetch;
    const uploadPdf = vi.fn(async () => 'https://blob.example/stored.pdf');
    const llm = fakeLLM();

    await processImportedPdf(
      p.id,
      'https://oa.example/z.pdf',
      { title: 'Injected Title', authors: ['Z. Writer'] },
      { db: ctx.db, schema: ctx.schema, llm, fetchFn, uploadPdf },
    );

    const [row] = await ctx.db.select().from(ctx.schema.papers).where(eq(ctx.schema.papers.id, p.id));
    expect(row.status).toBe('ready');
    expect(row.pdfUrl).toBe('https://blob.example/stored.pdf');
    expect(row.title).toBe('Injected Title');
    expect(row.fullText).toContain('Transformers');
    expect(uploadPdf).toHaveBeenCalled();
    expect(llm.chat).not.toHaveBeenCalled();
  });

  it('falls back to a metadata_only stub when the link is not a real PDF', async () => {
    const metadata = { title: 'Paywalled Paper', authors: ['P. Author'], year: 2022, journal: 'Nature' };
    // Mirror the real flow: createImportedPaper inserts a pending row (with title)
    // first, then processImportedPdf runs in the background.
    const { id } = await createImportedPaper(
      { workspaceId: null, collectionId: null, userId: null, metadata, pdfUrl: 'https://publisher.example/landing-page' },
      { db: ctx.db, schema: ctx.schema },
    );
    const html = new TextEncoder().encode('<!DOCTYPE html><html><head><link rel="stylesheet"></head></html>');
    const fetchFn = vi.fn(async () => ({ ok: true, arrayBuffer: async () => html.buffer })) as unknown as typeof fetch;
    const uploadPdf = vi.fn();
    const llm = fakeLLM();

    await processImportedPdf(id, 'https://publisher.example/landing-page', metadata, {
      db: ctx.db,
      schema: ctx.schema,
      llm,
      fetchFn,
      uploadPdf,
    });

    const [row] = await ctx.db.select().from(ctx.schema.papers).where(eq(ctx.schema.papers.id, id));
    expect(row.status).toBe('metadata_only');
    expect(row.title).toBe('Paywalled Paper');
    expect(row.authors).toEqual(['P. Author']);
    expect(row.pdfUrl).toBeNull();
    expect(uploadPdf).not.toHaveBeenCalled();
    expect(llm.embed).not.toHaveBeenCalled();
  });

  it('marks the paper failed when the pdf download fails', async () => {
    const [p] = await ctx.db.insert(ctx.schema.papers).values({ status: 'pending' }).returning();
    const fetchFn = vi.fn(async () => ({ ok: false, status: 404 })) as unknown as typeof fetch;
    await processImportedPdf(
      p.id,
      'https://oa.example/missing.pdf',
      { title: 'X' },
      { db: ctx.db, schema: ctx.schema, llm: fakeLLM(), fetchFn, uploadPdf: vi.fn() },
    );
    const [row] = await ctx.db.select().from(ctx.schema.papers).where(eq(ctx.schema.papers.id, p.id));
    expect(row.status).toBe('failed');
    expect(row.errorReason).toBeTruthy();
  });
});
