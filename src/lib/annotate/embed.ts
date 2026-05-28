import { and, eq } from 'drizzle-orm';
import type { LLMProvider } from '../llm/types';

interface Deps {
  db: any;
  schema: any;
  llm: LLMProvider;
}

export function annotationChunkText(quote: string, comment: string): string {
  return [quote, comment].map((s) => (s ?? '').trim()).filter(Boolean).join('\n');
}

// Keeps an annotation's single chunk in sync. Removes any existing chunk for the
// annotation, then (if there is text) embeds and inserts a fresh one.
export async function embedAnnotation(annotationId: string, deps: Deps): Promise<void> {
  const { db, schema, llm } = deps;
  const [ann] = await db.select().from(schema.annotations).where(eq(schema.annotations.id, annotationId));
  if (!ann) return;
  await db
    .delete(schema.chunks)
    .where(and(eq(schema.chunks.parentType, 'annotation'), eq(schema.chunks.parentId, annotationId)));
  const text = annotationChunkText(ann.quote, ann.comment);
  if (!text) return;
  const [paper] = await db.select().from(schema.papers).where(eq(schema.papers.id, ann.paperId));
  const [embedding] = await llm.embed([text]);
  await db.insert(schema.chunks).values({
    parentType: 'annotation',
    parentId: annotationId,
    collectionId: paper?.collectionId ?? null,
    chunkIndex: 0,
    text,
    embedding,
    page: ann.page,
    charStart: ann.charStart,
    charEnd: ann.charEnd,
  });
}
