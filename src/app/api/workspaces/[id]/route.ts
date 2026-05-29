import { z } from 'zod';
import { db, schema } from '@/db/client';
import { requireUser, requireMember } from '@/lib/session';
import { renameWorkspace, deleteWorkspace } from '@/lib/workspaces/service';

const Patch = z.object({ name: z.string().min(1) });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  const m = await requireMember(id, user.id);
  if (m?.role !== 'owner') return new Response('Forbidden', { status: 403 });
  const { name } = Patch.parse(await req.json());
  return Response.json(await renameWorkspace(id, name, { db, schema }));
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  const m = await requireMember(id, user.id);
  if (m?.role !== 'owner') return new Response('Forbidden', { status: 403 });
  await deleteWorkspace(id, { db, schema });
  return Response.json({ ok: true });
}
