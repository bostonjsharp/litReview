import { z } from 'zod';
import { db, schema } from '@/db/client';
import { requireUser } from '@/lib/session';
import { createWorkspace, listWorkspaces } from '@/lib/workspaces/service';

const Body = z.object({ name: z.string().min(1) });

export async function GET() {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  return Response.json(await listWorkspaces(user.id, { db, schema }));
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { name } = Body.parse(await req.json());
  return Response.json(await createWorkspace(name, user.id, { db, schema }), { status: 201 });
}
