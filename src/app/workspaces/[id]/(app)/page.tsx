import Link from "next/link";
import { eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { PageHead } from "@/components/ui/PageHead";
import { Icon } from "@/components/ui/Icon";
import { colorForId } from "@/lib/ui/display";
import { NewCollectionCard } from "@/components/workspace/NewCollectionCard";

export default async function WorkspaceDashboard({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [[w], collections] = await Promise.all([
    db.select().from(schema.workspaces).where(eq(schema.workspaces.id, id)),
    db.select().from(schema.collections).where(eq(schema.collections.workspaceId, id)),
  ]);

  // Workspace-level stats + per-collection counts — all independent, run concurrently
  const collectionIds = collections.map((c) => c.id);

  const [
    [{ totalPapers }],
    [{ totalAnnotations }],
    [{ totalThemes }],
    paperRows,
    reviewRows,
  ] = await Promise.all([
    db
      .select({ totalPapers: sql<number>`count(*)::int` })
      .from(schema.papers)
      .where(eq(schema.papers.workspaceId, id)),
    db
      .select({ totalAnnotations: sql<number>`count(*)::int` })
      .from(schema.annotations)
      .innerJoin(schema.papers, eq(schema.annotations.paperId, schema.papers.id))
      .where(eq(schema.papers.workspaceId, id)),
    db
      .select({ totalThemes: sql<number>`count(*)::int` })
      .from(schema.themes)
      .innerJoin(
        schema.collections,
        eq(schema.themes.collectionId, schema.collections.id)
      )
      .where(eq(schema.collections.workspaceId, id)),
    collectionIds.length > 0
      ? db
          .select({
            collectionId: schema.paperCollections.collectionId,
            cnt: sql<number>`count(*)::int`,
          })
          .from(schema.paperCollections)
          .where(inArray(schema.paperCollections.collectionId, collectionIds))
          .groupBy(schema.paperCollections.collectionId)
      : Promise.resolve([]),
    collectionIds.length > 0
      ? db
          .select({
            collectionId: schema.reviews.collectionId,
            cnt: sql<number>`count(*)::int`,
          })
          .from(schema.reviews)
          .where(inArray(schema.reviews.collectionId, collectionIds))
          .groupBy(schema.reviews.collectionId)
      : Promise.resolve([]),
  ]);

  const paperCounts: Record<string, number> = {};
  for (const row of paperRows) {
    if (row.collectionId) paperCounts[row.collectionId] = row.cnt;
  }

  const reviewCounts: Record<string, number> = {};
  for (const row of reviewRows) {
    if (row.collectionId) reviewCounts[row.collectionId] = row.cnt;
  }

  return (
    <>
      <PageHead eyebrow={w.name} title="Collections">
        <Link href={`/workspaces/${id}/members`} className="btn btn-ghost">
          <Icon name="users" size={16} /> Members
        </Link>
        <Link href={`/workspaces/${id}/upload`} className="btn btn-primary">
          <Icon name="plus" /> Add paper
        </Link>
      </PageHead>

      <div className="stat-row">
        <div className="stat">
          <span className="n tabular">{collections.length}</span>
          <span className="l">collections</span>
        </div>
        <div className="stat">
          <span className="n tabular">{totalPapers}</span>
          <span className="l">papers</span>
        </div>
        <div className="stat">
          <span className="n tabular">{totalAnnotations}</span>
          <span className="l">annotations</span>
        </div>
        <div className="stat">
          <span className="n tabular">{totalThemes}</span>
          <span className="l">themes</span>
        </div>
        <div className="grow" />
        <div className="stat" style={{ alignItems: "flex-end" }}>
          <Link href={`/workspaces/${id}/chat`} className="btn btn-quiet btn-sm">
            <Icon name="chat" size={15} /> Ask the corpus
          </Link>
        </div>
      </div>

      <div className="coll-grid">
        {collections.map((c) => {
          const pCount = paperCounts[c.id] ?? 0;
          const rCount = reviewCounts[c.id] ?? 0;
          return (
            <Link
              key={c.id}
              href={`/workspaces/${id}/collections/${c.id}`}
              className="card card-hover coll-card"
            >
              <div className="c-top">
                <span
                  className="c-dot"
                  style={{ background: colorForId(c.id) }}
                />
                <span className="c-name">{c.name}</span>
              </div>
              <div className="c-q">{c.researchQuestion}</div>
              <div className="c-foot">
                <span className="item">
                  <Icon name="book" size={15} /> {pCount} papers
                </span>
                <span className="item">
                  <Icon name="file" size={15} /> {rCount} reviews
                </span>
              </div>
            </Link>
          );
        })}
        <NewCollectionCard workspaceId={id} />
      </div>
    </>
  );
}
