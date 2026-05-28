import { z } from 'zod';
import { db, schema } from '@/db/client';
import { requireUser } from '@/lib/session';
import { createTheme, listThemes } from '@/lib/themes/service';

const Body = z.object({ name: z.string().min(1) });

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  return Response.json(await listThemes(id, { db, schema }));
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  const { name } = Body.parse(await req.json());
  const theme = await createTheme(id, name, user.id, { db, schema });
  return Response.json(theme, { status: 201 });
}
