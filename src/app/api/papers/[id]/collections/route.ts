import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { requireUser, requireMember } from '@/lib/session';
import { addPaperToCollection } from '@/lib/papers/collections';

const Body = z.object({ collectionId: z.string().uuid() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  const { collectionId } = Body.parse(await req.json());
  const [paper] = await db.select({ workspaceId: schema.papers.workspaceId }).from(schema.papers).where(eq(schema.papers.id, id));
  const [collection] = await db.select({ workspaceId: schema.collections.workspaceId }).from(schema.collections).where(eq(schema.collections.id, collectionId));
  if (!paper || !collection) return new Response('Not found', { status: 404 });
  if (!paper.workspaceId || paper.workspaceId !== collection.workspaceId) return new Response('Forbidden', { status: 403 });
  if (!(await requireMember(paper.workspaceId, user.id))) return new Response('Forbidden', { status: 403 });
  await addPaperToCollection(id, collectionId, { db, schema });
  return new Response(null, { status: 204 });
}
