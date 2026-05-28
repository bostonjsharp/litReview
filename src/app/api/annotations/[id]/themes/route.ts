import { z } from 'zod';
import { db, schema } from '@/db/client';
import { requireUser } from '@/lib/session';
import { tagAnnotation } from '@/lib/themes/service';

const Body = z.object({ themeId: z.string().uuid() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  const { themeId } = Body.parse(await req.json());
  try {
    await tagAnnotation(id, themeId, { db, schema });
    return Response.json({ ok: true }, { status: 201 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
