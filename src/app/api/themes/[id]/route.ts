import { z } from 'zod';
import { db, schema } from '@/db/client';
import { requireUser } from '@/lib/session';
import { renameTheme, deleteTheme } from '@/lib/themes/service';

const Patch = z.object({ name: z.string().min(1) });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  const { name } = Patch.parse(await req.json());
  return Response.json(await renameTheme(id, name, { db, schema }));
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  await deleteTheme(id, { db, schema });
  return Response.json({ ok: true });
}
