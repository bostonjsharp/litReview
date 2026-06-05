import { and, eq, inArray } from 'drizzle-orm';

interface Deps {
  db: any;
  schema: any;
}

export async function addPaperToCollection(paperId: string, collectionId: string, deps: Deps) {
  await deps.db.insert(deps.schema.paperCollections).values({ paperId, collectionId }).onConflictDoNothing();
}

export async function removePaperFromCollection(paperId: string, collectionId: string, deps: Deps) {
  const { db, schema } = deps;
  await db.delete(schema.paperCollections).where(
    and(eq(schema.paperCollections.paperId, paperId), eq(schema.paperCollections.collectionId, collectionId)),
  );
}

export async function collectionPaperIds(collectionId: string, deps: Deps): Promise<string[]> {
  const { db, schema } = deps;
  const rows = await db.select({ paperId: schema.paperCollections.paperId })
    .from(schema.paperCollections).where(eq(schema.paperCollections.collectionId, collectionId));
  return rows.map((r: { paperId: string }) => r.paperId);
}

export async function paperCollectionIds(paperId: string, deps: Deps): Promise<string[]> {
  const { db, schema } = deps;
  const rows = await db.select({ collectionId: schema.paperCollections.collectionId })
    .from(schema.paperCollections).where(eq(schema.paperCollections.paperId, paperId));
  return rows.map((r: { collectionId: string }) => r.collectionId);
}

export async function isPaperInCollection(paperId: string, collectionId: string, deps: Deps): Promise<boolean> {
  const { db, schema } = deps;
  const [row] = await db.select().from(schema.paperCollections).where(
    and(eq(schema.paperCollections.paperId, paperId), eq(schema.paperCollections.collectionId, collectionId)),
  );
  return !!row;
}

// Every paper in the workspace plus the collection ids it belongs to.
export async function listWorkspacePapers(workspaceId: string, deps: Deps) {
  const { db, schema } = deps;
  const papers = await db.select().from(schema.papers).where(eq(schema.papers.workspaceId, workspaceId));
  const ids = papers.map((p: { id: string }) => p.id);
  const links = ids.length
    ? await db.select({ paperId: schema.paperCollections.paperId, collectionId: schema.paperCollections.collectionId })
        .from(schema.paperCollections).where(inArray(schema.paperCollections.paperId, ids))
    : [];
  const byPaper: Record<string, string[]> = {};
  for (const l of links) (byPaper[l.paperId] ??= []).push(l.collectionId);
  return papers.map((p: { id: string }) => ({ ...p, collectionIds: byPaper[p.id] ?? [] }));
}
