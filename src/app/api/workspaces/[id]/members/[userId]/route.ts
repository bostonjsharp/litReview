import { db, schema } from '@/db/client';
import { requireUser, requireMember } from '@/lib/session';
import { removeMember } from '@/lib/workspaces/service';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id, userId } = await params;
  const m = await requireMember(id, user.id);
  if (m?.role !== 'owner') return new Response('Forbidden', { status: 403 });
  try {
    await removeMember(id, userId, { db, schema });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
