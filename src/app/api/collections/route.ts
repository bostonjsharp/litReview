import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { requireUser, requireMember } from '@/lib/session';

const Body = z.object({ workspaceId: z.string().uuid(), name: z.string().min(1), researchQuestion: z.string().optional() });

export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const workspaceId = new URL(req.url).searchParams.get('workspaceId');
  if (!workspaceId) return Response.json({ error: 'workspaceId required' }, { status: 400 });
  if (!(await requireMember(workspaceId, user.id))) return new Response('Forbidden', { status: 403 });
  return Response.json(await db.select().from(schema.collections).where(eq(schema.collections.workspaceId, workspaceId)));
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const body = Body.parse(await req.json());
  if (!(await requireMember(body.workspaceId, user.id))) return new Response('Forbidden', { status: 403 });
  const [row] = await db
    .insert(schema.collections)
    .values({ name: body.name, researchQuestion: body.researchQuestion, workspaceId: body.workspaceId, createdBy: user.id })
    .returning();
  return Response.json(row, { status: 201 });
}
