import { and, eq } from 'drizzle-orm';
import { pageForOffset } from '../ingest/chunk';
import { embedAnnotation } from './embed';
import type { LLMProvider } from '../llm/types';

interface Deps {
  db: any;
  schema: any;
  llm: LLMProvider;
}

// Embedding feeds the search index — it must never decide whether the user's note
// is saved. A slow/failed embedding call (the usual culprit behind "the note saved
// sometimes") is swallowed here; the annotation persists and re-embeds on next edit.
async function embedBestEffort(annotationId: string, deps: Deps): Promise<void> {
  try {
    await embedAnnotation(annotationId, deps);
  } catch (err) {
    console.error(`embedAnnotation failed for ${annotationId}; annotation saved without a chunk`, err);
  }
}

export interface CreateAnnotationInput {
  paperId: string;
  createdBy: string | null;
  charStart: number;
  charEnd: number;
  quote: string;
  comment: string;
}

export async function createAnnotation(input: CreateAnnotationInput, deps: Deps) {
  const { db, schema } = deps;
  if (input.charStart < 0 || input.charEnd <= input.charStart) throw new Error('invalid range');
  const [paper] = await db.select().from(schema.papers).where(eq(schema.papers.id, input.paperId));
  if (!paper) throw new Error('paper not found');
  const offsets = (paper.pageOffsets as number[] | null) ?? [0];
  const page = pageForOffset(offsets, input.charStart);
  const [row] = await db
    .insert(schema.annotations)
    .values({
      paperId: input.paperId,
      createdBy: input.createdBy,
      charStart: input.charStart,
      charEnd: input.charEnd,
      page,
      quote: input.quote,
      comment: input.comment,
    })
    .returning();
  await embedBestEffort(row.id, deps);
  return row;
}

export async function updateAnnotation(id: string, comment: string, deps: Deps) {
  const { db, schema } = deps;
  const [row] = await db
    .update(schema.annotations)
    .set({ comment, updatedAt: new Date() })
    .where(eq(schema.annotations.id, id))
    .returning();
  if (!row) throw new Error('annotation not found');
  await embedBestEffort(id, deps);
  return row;
}

export async function deleteAnnotation(id: string, deps: Deps) {
  const { db, schema } = deps;
  await db
    .delete(schema.chunks)
    .where(and(eq(schema.chunks.parentType, 'annotation'), eq(schema.chunks.parentId, id)));
  await db.delete(schema.annotations).where(eq(schema.annotations.id, id));
}

export async function listAnnotations(paperId: string, deps: Deps) {
  const { db, schema } = deps;
  return db.select().from(schema.annotations).where(eq(schema.annotations.paperId, paperId));
}
