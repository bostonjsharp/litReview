import { z } from 'zod';
import { db, schema } from '@/db/client';
import { requireUser } from '@/lib/session';
import { getLLM } from '@/lib/llm';
import { updateAnnotation, deleteAnnotation } from '@/lib/annotate/service';

const Patch = z.object({ comment: z.string() });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  const { comment } = Patch.parse(await req.json());
  const ann = await updateAnnotation(id, comment, { db, schema, llm: getLLM() });
  return Response.json(ann);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  await deleteAnnotation(id, { db, schema, llm: getLLM() });
  return Response.json({ ok: true });
}
