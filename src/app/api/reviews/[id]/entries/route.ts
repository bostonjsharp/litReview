import { z } from 'zod';
import { db, schema } from '@/db/client';
import { requireUser } from '@/lib/session';
import { getReviewEntries, addProseEntry, addAnnotationEntry } from '@/lib/reviews/service';

const Body = z.union([
  z.object({ kind: z.literal('prose'), prose: z.string().min(1) }),
  z.object({ kind: z.literal('annotation'), annotationId: z.string().uuid() }),
]);

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  return Response.json(await getReviewEntries(id, { db, schema }));
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  const body = Body.parse(await req.json());
  const row =
    body.kind === 'prose'
      ? await addProseEntry(id, body.prose, { db, schema })
      : await addAnnotationEntry(id, body.annotationId, { db, schema });
  return Response.json(row, { status: 201 });
}
