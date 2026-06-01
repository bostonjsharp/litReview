import { eq, sql } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { ChatPanel } from '@/components/ChatPanel';

export default async function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Fetch collections for scope pills
  const collections = await db
    .select({ id: schema.collections.id, name: schema.collections.name })
    .from(schema.collections)
    .where(eq(schema.collections.workspaceId, id));

  // Fetch total paper count in workspace for the hint
  const [{ paperCount }] = await db
    .select({ paperCount: sql<number>`count(*)::int` })
    .from(schema.papers)
    .where(eq(schema.papers.workspaceId, id));

  return (
    <ChatPanel
      workspaceId={id}
      collections={collections}
      paperCount={paperCount ?? 0}
    />
  );
}
