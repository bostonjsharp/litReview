import { eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { requireUser, requireMember } from '@/lib/session';
import { getMatrix } from '@/lib/themes/service';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  const [col] = await db.select({ workspaceId: schema.collections.workspaceId }).from(schema.collections).where(eq(schema.collections.id, id));
  if (!col?.workspaceId || !(await requireMember(col.workspaceId, user.id))) return new Response('Forbidden', { status: 403 });
  return Response.json(await getMatrix(id, { db, schema }));
}
