import { z } from 'zod';
import { db, schema } from '@/db/client';
import { requireUser } from '@/lib/session';
import { moveEntry, removeEntry, updateProseEntry } from '@/lib/reviews/service';

const Patch = z.union([
  z.object({ direction: z.enum(['up', 'down']) }),
  z.object({ prose: z.string() }),
]);

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; entryId: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id, entryId } = await params;
  const body = Patch.parse(await req.json());
  if ('direction' in body) await moveEntry(id, entryId, body.direction, { db, schema });
  else await updateProseEntry(entryId, body.prose, { db, schema });
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; entryId: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id, entryId } = await params;
  await removeEntry(id, entryId, { db, schema });
  return Response.json({ ok: true });
}
