import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { requireUser, requireMember } from '@/lib/session';
import { tagAnnotation } from '@/lib/themes/service';

const Body = z.object({ themeId: z.string().uuid() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  const { themeId } = Body.parse(await req.json());
  const [ann] = await db.select({ paperId: schema.annotations.paperId }).from(schema.annotations).where(eq(schema.annotations.id, id));
  if (!ann) return new Response('Not found', { status: 404 });
  const [paper] = await db.select({ workspaceId: schema.papers.workspaceId }).from(schema.papers).where(eq(schema.papers.id, ann.paperId));
  if (!paper?.workspaceId || !(await requireMember(paper.workspaceId, user.id))) return new Response('Forbidden', { status: 403 });
  try {
    await tagAnnotation(id, themeId, { db, schema });
    return Response.json({ ok: true }, { status: 201 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
