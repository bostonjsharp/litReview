import { z } from 'zod';
import { db, schema } from '@/db/client';
import { requireUser, requireMember } from '@/lib/session';
import { getReviewEntries, addProseEntry, addAnnotationEntry, reviewWorkspaceId } from '@/lib/reviews/service';

const Body = z.union([
  z.object({ kind: z.literal('prose'), prose: z.string().min(1) }),
  z.object({ kind: z.literal('annotation'), annotationId: z.string().uuid() }),
]);

// Resolves the review's workspace and verifies membership. Returns an error Response to
// return, or null when the user may proceed.
async function guard(reviewId: string, userId: string): Promise<Response | null> {
  const ws = await reviewWorkspaceId(reviewId, { db, schema });
  if (!ws) return new Response('Not found', { status: 404 });
  if (!(await requireMember(ws, userId))) return new Response('Forbidden', { status: 403 });
  return null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  const denied = await guard(id, user.id);
  if (denied) return denied;
  return Response.json(await getReviewEntries(id, { db, schema }));
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  const denied = await guard(id, user.id);
  if (denied) return denied;
  const body = Body.parse(await req.json());
  const row =
    body.kind === 'prose'
      ? await addProseEntry(id, body.prose, { db, schema })
      : await addAnnotationEntry(id, body.annotationId, { db, schema });
  return Response.json(row, { status: 201 });
}
