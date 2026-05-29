import { z } from 'zod';
import { db, schema } from '@/db/client';
import { requireUser } from '@/lib/session';
import { joinByCode } from '@/lib/workspaces/service';

const Body = z.object({ code: z.string().min(1) });

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { code } = Body.parse(await req.json());
  try {
    const w = await joinByCode(code, user.id, { db, schema });
    return Response.json({ id: w.id, name: w.name });
  } catch {
    return Response.json({ error: 'Invalid or expired invite code' }, { status: 404 });
  }
}
