import { eq } from 'drizzle-orm';
import { extractPdf } from './extract';
import { chunkText, pageForOffset } from './chunk';
import { extractMetadata } from './metadata';
import type { LLMProvider, ParentType } from '../llm/types';

interface ProcessInput {
  parentType: ParentType;
  parentId: string;
  bytes?: Uint8Array;
  pastedText?: string;
}

interface Deps {
  db: any;
  schema: any;
  llm: LLMProvider;
}

export async function processDocument(input: ProcessInput, deps: Deps): Promise<void> {
  const { db, schema, llm } = deps;
  const table = input.parentType === 'paper' ? schema.papers : schema.reviews;
  try {
    await db.update(table).set({ status: 'processing' }).where(eq(table.id, input.parentId));

    let text: string;
    let pageOffsets: number[] = [0];
    if (input.bytes) {
      const doc = await extractPdf(input.bytes);
      text = doc.text;
      pageOffsets = doc.pageOffsets;
    } else {
      text = input.pastedText ?? '';
    }
    if (text.trim().length === 0) {
      throw new Error(
        'No extractable text (scanned/encrypted PDF or empty paste). Paste text manually to proceed.',
      );
    }

    if (input.parentType === 'paper') {
      const md = await extractMetadata(text, llm).catch(() => ({}) as Awaited<ReturnType<typeof extractMetadata>>);
      await db
        .update(schema.papers)
        .set({
          fullText: text,
          pageOffsets,
          title: md.title ?? undefined,
          authors: md.authors ?? undefined,
          year: md.year ?? undefined,
          doi: md.doi ?? undefined,
          journal: md.journal ?? undefined,
          abstract: md.abstract ?? undefined,
          metadata: md,
        })
        .where(eq(schema.papers.id, input.parentId));
    } else {
      await db.update(schema.reviews).set({ bodyText: text }).where(eq(schema.reviews.id, input.parentId));
    }

    const chunks = chunkText(text);
    const embeddings = await llm.embed(chunks.map((c) => c.text));
    if (embeddings.length !== chunks.length) {
      throw new Error(`Embedding count mismatch: got ${embeddings.length}, expected ${chunks.length}`);
    }
    const [parentRow] = await db.select().from(table).where(eq(table.id, input.parentId));
    const rows = chunks.map((c, i) => ({
      parentType: input.parentType,
      parentId: input.parentId,
      collectionId: parentRow.collectionId ?? null,
      chunkIndex: c.index,
      text: c.text,
      embedding: embeddings[i],
      page: pageForOffset(pageOffsets, c.charStart),
      charStart: c.charStart,
      charEnd: c.charEnd,
    }));
    if (rows.length > 0) await db.insert(schema.chunks).values(rows);

    await db.update(table).set({ status: 'ready', errorReason: null }).where(eq(table.id, input.parentId));
  } catch (err) {
    await db
      .update(table)
      .set({ status: 'failed', errorReason: (err as Error).message })
      .where(eq(table.id, input.parentId));
  }
}
