import { eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { requireUser, requireMember } from '@/lib/session';
import { removePaperFromCollection } from '@/lib/papers/collections';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; collectionId: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id, collectionId } = await params;
  const [paper] = await db.select({ workspaceId: schema.papers.workspaceId }).from(schema.papers).where(eq(schema.papers.id, id));
  if (!paper?.workspaceId) return new Response('Not found', { status: 404 });
  if (!(await requireMember(paper.workspaceId, user.id))) return new Response('Forbidden', { status: 403 });
  await removePaperFromCollection(id, collectionId, { db, schema });
  return new Response(null, { status: 204 });
}
