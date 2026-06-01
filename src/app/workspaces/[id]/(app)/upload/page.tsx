import { eq, and } from 'drizzle-orm';
import { redirect, notFound } from 'next/navigation';
import { db, schema } from '@/db/client';
import { requireUser } from '@/lib/session';
import { PageHead } from '@/components/ui/PageHead';
import { UploadForm } from '@/components/UploadForm';

export default async function UploadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const user = await requireUser();
  if (!user) redirect('/login');

  const [ws] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, id));
  if (!ws) notFound();

  const [membership] = await db
    .select()
    .from(schema.workspaceMembers)
    .where(and(eq(schema.workspaceMembers.workspaceId, id), eq(schema.workspaceMembers.userId, user.id)));
  if (!membership) redirect('/');

  const collections = await db
    .select({ id: schema.collections.id, name: schema.collections.name })
    .from(schema.collections)
    .where(eq(schema.collections.workspaceId, id));

  return (
    <div className="upload-wrap">
      <PageHead
        eyebrow={`${ws.name} · import`}
        title="Add to your corpus"
        sub="Drop a PDF or paste text. We extract the title, authors and full text in the background."
      />
      <UploadForm workspaceId={id} collections={collections} />
    </div>
  );
}
