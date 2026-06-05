import { z } from 'zod';
import { db, schema } from '@/db/client';
import { requireUser, requireMember } from '@/lib/session';
import { moveEntry, removeEntry, updateProseEntry, reviewWorkspaceId } from '@/lib/reviews/service';

const Patch = z.union([
  z.object({ direction: z.enum(['up', 'down']) }),
  z.object({ prose: z.string() }),
]);

async function guard(reviewId: string, userId: string): Promise<Response | null> {
  const ws = await reviewWorkspaceId(reviewId, { db, schema });
  if (!ws) return new Response('Not found', { status: 404 });
  if (!(await requireMember(ws, userId))) return new Response('Forbidden', { status: 403 });
  return null;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; entryId: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id, entryId } = await params;
  const denied = await guard(id, user.id);
  if (denied) return denied;
  const body = Patch.parse(await req.json());
  if ('direction' in body) await moveEntry(id, entryId, body.direction, { db, schema });
  else await updateProseEntry(entryId, body.prose, { db, schema });
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; entryId: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id, entryId } = await params;
  const denied = await guard(id, user.id);
  if (denied) return denied;
  await removeEntry(id, entryId, { db, schema });
  return Response.json({ ok: true });
}
