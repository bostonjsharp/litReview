import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { colorForId } from "@/lib/ui/display";
import { RetryButton } from "@/components/workspace/RetryButton";

export default async function CollectionDetail({
  params,
}: {
  params: Promise<{ id: string; cid: string }>;
}) {
  const { id, cid } = await params;

  const [collection] = await db
    .select()
    .from(schema.collections)
    .where(and(eq(schema.collections.id, cid), eq(schema.collections.workspaceId, id)));
  if (!collection) notFound();

  const papers = await db
    .select()
    .from(schema.papers)
    .where(eq(schema.papers.collectionId, cid));

  // Per-paper annotation counts for papers in this collection
  const annMap: Record<string, number> = {};
  const paperIds = papers.map((p) => p.id);
  if (paperIds.length > 0) {
    const annRows = await db
      .select({
        paperId: schema.annotations.paperId,
        cnt: sql<number>`count(*)::int`,
      })
      .from(schema.annotations)
      .where(inArray(schema.annotations.paperId, paperIds))
      .groupBy(schema.annotations.paperId);

    for (const row of annRows) {
      annMap[row.paperId] = row.cnt;
    }
  }

  const reviews = await db
    .select()
    .from(schema.reviews)
    .where(eq(schema.reviews.collectionId, cid));

  return (
    <>
      <Link
        href={`/workspaces/${id}`}
        className="reader-back"
        style={{ marginBottom: 18, display: "inline-flex", alignItems: "center", gap: 6 }}
      >
        <Icon name="chevronLeft" size={16} /> All collections
      </Link>

      <div className="coll-hero">
        <div className="row gap3" style={{ marginBottom: 4 }}>
          <span
            className="c-dot"
            style={{
              width: 10,
              height: 10,
              borderRadius: 99,
              background: colorForId(cid),
              flexShrink: 0,
            }}
          />
          <span
            className="c-name"
            style={{
              fontFamily: "var(--mono)",
              fontSize: 12,
              letterSpacing: ".04em",
              textTransform: "uppercase",
              color: "var(--muted)",
            }}
          >
            {collection.name}
          </span>
        </div>
        <div className="eyebrow" style={{ color: "var(--faint)" }}>
          Research question
        </div>
        <div className="q" style={{ fontSize: 25 }}>
          {collection.researchQuestion}
        </div>
        <div className="row gap2" style={{ marginTop: 22 }}>
          <Link href={`/workspaces/${id}/upload`} className="btn btn-primary">
            <Icon name="plus" /> Add paper
          </Link>
          <Link
            href={`/workspaces/${id}/collections/${cid}/matrix`}
            className="btn btn-ghost"
          >
            <Icon name="grid" size={16} /> Open matrix
          </Link>
          <Link href={`/workspaces/${id}/chat`} className="btn btn-ghost">
            <Icon name="chat" size={16} /> Ask about this
          </Link>
        </div>
      </div>

      <div className="list-head">
        <h2>
          Papers <span className="count">{papers.length}</span>
        </h2>
      </div>
      <div className="card list-card">
        {papers.length === 0 && (
          <div className="paper-row">
            <span className="meta" style={{ padding: "8px 0" }}>
              No papers yet.
            </span>
          </div>
        )}
        {papers.map((p) => {
          const isReady = p.status === "ready";
          const annCount = annMap[p.id] ?? 0;
          const pageOffsets = Array.isArray(p.pageOffsets) ? p.pageOffsets : null;
          const pageCount = pageOffsets ? pageOffsets.length : null;

          // Build meta string: filter nulls then join with " · "
          const metaParts = [
            p.authors && p.authors.length > 0 ? p.authors.join(", ") : null,
            p.year ? String(p.year) : null,
            p.journal || null,
          ].filter(Boolean);

          const inner = (
            <>
              <div className="placeholder paper-thumb" />
              <div className="paper-main">
                <div className="paper-title">{p.title || "Untitled"}</div>
                {metaParts.length > 0 && (
                  <div className="paper-meta">
                    <span className="meta">{metaParts.join(" · ")}</span>
                  </div>
                )}
              </div>
              {isReady && annCount > 0 && (
                <span className="ann-pill">
                  <Icon name="note" size={14} /> {annCount}
                </span>
              )}
              {isReady ? (
                pageCount !== null ? (
                  <span className="meta tabular">p.{pageCount}</span>
                ) : null
              ) : (
                <StatusBadge status={p.status} />
              )}
              {p.status === "failed" && (
                <RetryButton parentType="paper" parentId={p.id} />
              )}
              {isReady && (
                <Icon
                  name="chevronRight"
                  size={17}
                  style={{ color: "var(--faint)" }}
                />
              )}
            </>
          );

          return isReady ? (
            <Link
              key={p.id}
              href={`/workspaces/${id}/papers/${p.id}`}
              className="paper-row click"
            >
              {inner}
            </Link>
          ) : (
            <div key={p.id} className="paper-row">
              {inner}
            </div>
          );
        })}
      </div>

      {reviews.length > 0 && (
        <>
          <div className="list-head">
            <h2>
              Reviews <span className="count">{reviews.length}</span>
            </h2>
            <Link href={`/workspaces/${id}/upload`} className="btn btn-quiet btn-sm">
              <Icon name="plus" size={14} /> New review
            </Link>
          </div>
          <div className="card list-card">
            {reviews.map((r) => (
              <Link
                key={r.id}
                href={`/workspaces/${id}/reviews/${r.id}/edit`}
                className="paper-row click"
              >
                <div
                  className="placeholder paper-thumb"
                  style={{
                    background: "var(--accent-faint)",
                    color: "var(--accent)",
                    border: "1px solid var(--accent-soft-border)",
                    fontSize: 10,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  REV
                </div>
                <div className="paper-main">
                  <div className="paper-title">
                    {r.title || "Untitled review"}
                  </div>
                  <div className="paper-meta">
                    <span className="meta">Review</span>
                  </div>
                </div>
                <StatusBadge status={r.status} />
                <Icon
                  name="chevronRight"
                  size={17}
                  style={{ color: "var(--faint)" }}
                />
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}
