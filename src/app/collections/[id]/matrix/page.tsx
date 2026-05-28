import { getMatrix } from '@/lib/themes/service';
import { db, schema } from '@/db/client';
import { MatrixGrid } from '@/components/MatrixGrid';
import { SuggestThemesPanel } from '@/components/SuggestThemesPanel';

export default async function MatrixPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const matrix = await getMatrix(id, { db, schema });
  return (
    <main style={{ padding: 40 }}>
      <h1>Literature matrix</h1>
      <SuggestThemesPanel collectionId={id} />
      <MatrixGrid matrix={matrix} />
    </main>
  );
}
