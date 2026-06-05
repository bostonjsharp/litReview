import { and, eq, inArray } from 'drizzle-orm';

interface Deps {
  db: any;
  schema: any;
}

// Deletes a paper and everything tied to it. Annotations (and via FK cascade their theme
// tags + review entries) and collection memberships are removed by the paper delete's FK
// cascades; chunks are polymorphic (no FK), so the paper's own chunks AND its annotations'
// chunks are removed explicitly first — otherwise they orphan in the search index.
export async function deletePaper(paperId: string, deps: Deps): Promise<void> {
  const { db, schema } = deps;
  const annRows = await db
    .select({ id: schema.annotations.id })
    .from(schema.annotations)
    .where(eq(schema.annotations.paperId, paperId));
  const annIds = annRows.map((r: { id: string }) => r.id);

  await db
    .delete(schema.chunks)
    .where(and(eq(schema.chunks.parentType, 'paper'), eq(schema.chunks.parentId, paperId)));
  if (annIds.length > 0) {
    await db
      .delete(schema.chunks)
      .where(and(eq(schema.chunks.parentType, 'annotation'), inArray(schema.chunks.parentId, annIds)));
  }

  // Cascades: annotations (→ annotation_themes, review_entries) and paper_collections.
  await db.delete(schema.papers).where(eq(schema.papers.id, paperId));
}
