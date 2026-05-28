import { db, schema } from '@/db/client';
import { requireUser } from '@/lib/session';
import { untagAnnotation } from '@/lib/themes/service';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; themeId: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id, themeId } = await params;
  await untagAnnotation(id, themeId, { db, schema });
  return Response.json({ ok: true });
}
