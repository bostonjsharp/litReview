import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { listWorkspacePapers } from '@/lib/papers/collections';
import { PageHead } from '@/components/ui/PageHead';
import { Icon } from '@/components/ui/Icon';
import { AddToCollection } from '@/components/papers/AddToCollection';
import { DeletePaperButton } from '@/components/papers/DeletePaperButton';

export default async function PapersLibrary({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [papers, collections] = await Promise.all([
    listWorkspacePapers(id, { db, schema }),
    db.select({ id: schema.collections.id, name: schema.collections.name }).from(schema.collections).where(eq(schema.collections.workspaceId, id)),
  ]);
  const nameById: Record<string, string> = Object.fromEntries(collections.map((c: { id: string; name: string }) => [c.id, c.name]));

  return (
    <>
      <PageHead eyebrow="Workspace" title="Papers">
        <Link href={`/workspaces/${id}/upload`} className="btn btn-primary"><Icon name="plus" /> Add paper</Link>
      </PageHead>
      <div className="card list-card">
        {papers.length === 0 && <div className="paper-row"><span className="meta" style={{ padding: '8px 0' }}>No papers yet.</span></div>}
        {papers.map((p: { id: string; title: string | null; status: string; collectionIds: string[] }) => {
          const ready = p.status === 'ready';
          const memberLabel =
            p.collectionIds.length === 0
              ? 'In no collection'
              : p.collectionIds.map((cid) => nameById[cid]).filter(Boolean).join(', ');
          const inner = (
            <>
              <div className="placeholder paper-thumb" />
              <div className="paper-main" style={{ minWidth: 0 }}>
                <div className="paper-title">{p.title || 'Untitled'}</div>
                <div className="paper-meta">
                  <span className="meta">{ready ? memberLabel : `${p.status} · ${memberLabel}`}</span>
                </div>
              </div>
            </>
          );
          const mainStyle = { display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 } as const;
          return (
            <div className="paper-row" key={p.id}>
              {ready ? (
                // Whole bubble (thumb + title + meta) is the click target into the reader.
                <Link
                  href={`/workspaces/${id}/papers/${p.id}`}
                  style={{ ...mainStyle, color: 'inherit', textDecoration: 'none' }}
                >
                  {inner}
                </Link>
              ) : (
                <div style={mainStyle}>{inner}</div>
              )}
              <AddToCollection paperId={p.id} collections={collections} memberOf={p.collectionIds} />
              <DeletePaperButton paperId={p.id} title={p.title || 'Untitled'} />
            </div>
          );
        })}
      </div>
    </>
  );
}
