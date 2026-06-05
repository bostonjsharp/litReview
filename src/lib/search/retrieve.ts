import { sql, and, or, eq, inArray } from 'drizzle-orm';
import type { LLMProvider, RetrievedChunk, ParentType } from '../llm/types';

export interface RetrieveScope {
  workspaceId?: string;
  collectionId?: string;
  parentType?: ParentType;
  parentId?: string;
}

export interface RetrieveOpts {
  scope?: RetrieveScope;
  k?: number;
  schema: any;
}

export async function retrieve(
  query: string,
  llm: LLMProvider,
  db: any,
  opts: RetrieveOpts,
): Promise<RetrievedChunk[]> {
  const { schema } = opts;
  const k = opts.k ?? 12;
  const [queryVec] = await llm.embed([query]);
  const vecLiteral = `[${queryVec.join(',')}]`;

  const conds: unknown[] = [];
  if (opts.scope?.workspaceId) conds.push(eq(schema.chunks.workspaceId, opts.scope.workspaceId));
  if (opts.scope?.collectionId) {
    const cid = opts.scope.collectionId;
    const paperRows = await db.select({ paperId: schema.paperCollections.paperId })
      .from(schema.paperCollections).where(eq(schema.paperCollections.collectionId, cid));
    const paperIds = paperRows.map((r: { paperId: string }) => r.paperId);
    const reviewRows = await db.select({ id: schema.reviews.id })
      .from(schema.reviews).where(eq(schema.reviews.collectionId, cid));
    const reviewIds = reviewRows.map((r: { id: string }) => r.id);
    const annRows = paperIds.length
      ? await db.select({ id: schema.annotations.id })
          .from(schema.annotations).where(inArray(schema.annotations.paperId, paperIds))
      : [];
    const annIds = annRows.map((r: { id: string }) => r.id);
    const branches = [];
    if (paperIds.length) branches.push(and(eq(schema.chunks.parentType, 'paper'), inArray(schema.chunks.parentId, paperIds)));
    if (reviewIds.length) branches.push(and(eq(schema.chunks.parentType, 'review'), inArray(schema.chunks.parentId, reviewIds)));
    if (annIds.length) branches.push(and(eq(schema.chunks.parentType, 'annotation'), inArray(schema.chunks.parentId, annIds)));
    if (branches.length === 0) return []; // collection has nothing to search
    conds.push(or(...branches));
  }
  if (opts.scope?.parentType) conds.push(eq(schema.chunks.parentType, opts.scope.parentType));
  if (opts.scope?.parentId) conds.push(eq(schema.chunks.parentId, opts.scope.parentId));
  const where = conds.length ? and(...(conds as never[])) : undefined;

  // Vector similarity (cosine distance; smaller = closer), blended with a Postgres
  // full-text rank so lexically-matching passages are boosted (hybrid retrieval).
  const rows = await db
    .select({
      id: schema.chunks.id,
      text: schema.chunks.text,
      parentType: schema.chunks.parentType,
      parentId: schema.chunks.parentId,
      page: schema.chunks.page,
      charStart: schema.chunks.charStart,
    })
    .from(schema.chunks)
    .where(where)
    .orderBy(
      sql`(${schema.chunks.embedding} <=> ${vecLiteral}::vector) - 0.05 * ts_rank(to_tsvector('english', ${schema.chunks.text}), plainto_tsquery('english', ${query}))`,
    )
    .limit(k);

  const out: RetrievedChunk[] = [];
  for (const r of rows) {
    if (r.parentType === 'annotation') {
      const [ann] = await db
        .select({ paperId: schema.annotations.paperId })
        .from(schema.annotations)
        .where(eq(schema.annotations.id, r.parentId));
      const [paper] = ann
        ? await db.select({ title: schema.papers.title }).from(schema.papers).where(eq(schema.papers.id, ann.paperId))
        : [undefined];
      out.push({
        id: r.id,
        text: r.text,
        source: {
          parentType: 'annotation',
          parentId: r.parentId,
          title: `Note on ${paper?.title ?? 'Untitled'}`,
          page: r.page,
          charStart: r.charStart,
          paperId: ann?.paperId ?? null,
        },
      });
      continue;
    }
    const table = r.parentType === 'paper' ? schema.papers : schema.reviews;
    const [parent] = await db.select({ title: table.title }).from(table).where(eq(table.id, r.parentId));
    out.push({
      id: r.id,
      text: r.text,
      source: {
        parentType: r.parentType,
        parentId: r.parentId,
        title: parent?.title ?? 'Untitled',
        page: r.page,
        charStart: r.charStart,
        paperId: r.parentType === 'paper' ? r.parentId : null,
      },
    });
  }
  return out;
}
