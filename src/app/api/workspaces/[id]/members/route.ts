import { db, schema } from '@/db/client';
import { requireUser, requireMember } from '@/lib/session';
import { listMembers } from '@/lib/workspaces/service';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  if (!(await requireMember(id, user.id))) return new Response('Forbidden', { status: 403 });
  return Response.json(await listMembers(id, { db, schema }));
}
