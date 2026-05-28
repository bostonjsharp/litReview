import { db, schema } from '@/db/client';
import { requireUser } from '@/lib/session';
import { getMatrix } from '@/lib/themes/service';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  return Response.json(await getMatrix(id, { db, schema }));
}
