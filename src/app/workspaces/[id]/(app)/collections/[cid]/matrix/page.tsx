import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { getMatrix } from '@/lib/themes/service';
import { db, schema } from '@/db/client';
import { MatrixGrid } from '@/components/MatrixGrid';
import { SuggestThemesPanel } from '@/components/SuggestThemesPanel';
import { PageHead } from '@/components/ui/PageHead';

export default async function MatrixPage({
  params,
}: {
  params: Promise<{ id: string; cid: string }>;
}) {
  const { id, cid } = await params;

  // Load the collection and verify it belongs to this workspace
  const [collection] = await db
    .select({ id: schema.collections.id, name: schema.collections.name, workspaceId: schema.collections.workspaceId })
    .from(schema.collections)
    .where(eq(schema.collections.id, cid));

  if (!collection || collection.workspaceId !== id) {
    notFound();
  }

  const matrix = await getMatrix(cid, { db, schema });

  return (
    <div className="matrix-page" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 'none', padding: '0 var(--s6)' }}>
        <PageHead eyebrow={collection.name} title="Literature matrix">
          <SuggestThemesPanel collectionId={cid} />
        </PageHead>
      </div>
      <MatrixGrid matrix={matrix} workspaceId={id} />
    </div>
  );
}
