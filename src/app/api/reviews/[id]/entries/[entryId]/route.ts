import { z } from 'zod';
import { db, schema } from '@/db/client';
import { requireUser } from '@/lib/session';
import { moveEntry, removeEntry } from '@/lib/reviews/service';

const Patch = z.object({ direction: z.enum(['up', 'down']) });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; entryId: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id, entryId } = await params;
  const { direction } = Patch.parse(await req.json());
  await moveEntry(id, entryId, direction, { db, schema });
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; entryId: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id, entryId } = await params;
  await removeEntry(id, entryId, { db, schema });
  return Response.json({ ok: true });
}
