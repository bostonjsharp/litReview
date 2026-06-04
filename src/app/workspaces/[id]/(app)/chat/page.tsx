import { eq, sql } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { requireUser } from '@/lib/session';
import { listChats } from '@/lib/chat/sessions';
import { ChatPanel } from '@/components/ChatPanel';

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const collections = await db
    .select({ id: schema.collections.id, name: schema.collections.name })
    .from(schema.collections)
    .where(eq(schema.collections.workspaceId, id));

  const [{ paperCount }] = await db
    .select({ paperCount: sql<number>`count(*)::int` })
    .from(schema.papers)
    .where(eq(schema.papers.workspaceId, id));

  const chatRows = user ? await listChats(id, user.id, { db, schema }) : [];
  const initialChats = chatRows.map((c: { id: string; title: string }) => ({ id: c.id, title: c.title }));

  return (
    <ChatPanel
      workspaceId={id}
      collections={collections}
      paperCount={paperCount ?? 0}
      initialChats={initialChats}
    />
  );
}
