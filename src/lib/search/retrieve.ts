import { sql, and, eq } from 'drizzle-orm';
import type { LLMProvider, RetrievedChunk, ParentType } from '../llm/types';

export interface RetrieveScope {
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
  const k = opts.k ?? 8;
  const [queryVec] = await llm.embed([query]);
  const vecLiteral = `[${queryVec.join(',')}]`;

  const conds: unknown[] = [];
  if (opts.scope?.collectionId) conds.push(eq(schema.chunks.collectionId, opts.scope.collectionId));
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
    })
    .from(schema.chunks)
    .where(where)
    .orderBy(
      sql`(${schema.chunks.embedding} <=> ${vecLiteral}::vector) - 0.1 * ts_rank(to_tsvector('english', ${schema.chunks.text}), plainto_tsquery('english', ${query}))`,
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
        source: { parentType: 'annotation', parentId: r.parentId, title: `Note on ${paper?.title ?? 'Untitled'}`, page: r.page },
      });
      continue;
    }
    const table = r.parentType === 'paper' ? schema.papers : schema.reviews;
    const [parent] = await db.select({ title: table.title }).from(table).where(eq(table.id, r.parentId));
    out.push({
      id: r.id,
      text: r.text,
      source: { parentType: r.parentType, parentId: r.parentId, title: parent?.title ?? 'Untitled', page: r.page },
    });
  }
  return out;
}
