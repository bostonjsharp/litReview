import { eq, and } from 'drizzle-orm';
import { redirect, notFound } from 'next/navigation';
import { db, schema } from '@/db/client';
import { requireUser } from '@/lib/session';
import { MembersPanel } from '@/components/MembersPanel';
import { PageHead } from '@/components/ui/PageHead';

export default async function MembersPage({ params }: { params: Promise<{ id: string }> }) {
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

  const isOwner = membership.role === 'owner';

  return (
    <div className="app-canvas fade-enter">
      <PageHead
        eyebrow={ws.name}
        title="Members"
        sub="Everyone here reads and writes the same content. Invite collaborators with a link."
      />
      <MembersPanel
        workspaceId={id}
        inviteCode={ws.inviteCode}
        currentUserId={user.id}
        isOwner={isOwner}
      />
    </div>
  );
}
