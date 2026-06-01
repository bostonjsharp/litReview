import { eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { MembersPanel } from '@/components/MembersPanel';

export default async function MembersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [w] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, id));
  if (!w) return <main style={{ padding: 40 }}>Workspace not found.</main>;
  return (
    <main style={{ padding: 40 }}>
      <h1>{w.name} — members</h1>
      <MembersPanel workspaceId={id} inviteCode={w.inviteCode} />
    </main>
  );
}
