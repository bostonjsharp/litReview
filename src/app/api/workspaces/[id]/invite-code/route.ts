import { db, schema } from '@/db/client';
import { requireUser, requireMember } from '@/lib/session';
import { regenerateInviteCode } from '@/lib/workspaces/service';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  const m = await requireMember(id, user.id);
  if (m?.role !== 'owner') return new Response('Forbidden', { status: 403 });
  return Response.json({ inviteCode: await regenerateInviteCode(id, { db, schema }) });
}
