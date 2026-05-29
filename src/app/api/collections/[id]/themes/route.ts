import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { requireUser, requireMember } from '@/lib/session';
import { createTheme, listThemes } from '@/lib/themes/service';

const Body = z.object({ name: z.string().min(1) });

async function collectionWorkspace(id: string): Promise<string | null> {
  const [col] = await db.select({ workspaceId: schema.collections.workspaceId }).from(schema.collections).where(eq(schema.collections.id, id));
  return col?.workspaceId ?? null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  const ws = await collectionWorkspace(id);
  if (!ws || !(await requireMember(ws, user.id))) return new Response('Forbidden', { status: 403 });
  return Response.json(await listThemes(id, { db, schema }));
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  const ws = await collectionWorkspace(id);
  if (!ws || !(await requireMember(ws, user.id))) return new Response('Forbidden', { status: 403 });
  const { name } = Body.parse(await req.json());
  const theme = await createTheme(id, name, user.id, { db, schema });
  return Response.json(theme, { status: 201 });
}
