import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { requireUser, requireMember } from '@/lib/session';

// Status endpoint so the upload UI can poll a review the same way it polls a paper.
// Without this, reviews were stranded at their last-known status ("pending") in the
// queue, which is what produced the "stuck pending — refresh the page" dead end.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  const [review] = await db.select().from(schema.reviews).where(eq(schema.reviews.id, id));
  if (!review) return new Response('Not found', { status: 404 });
  return Response.json({
    review: { id: review.id, title: review.title, status: review.status, errorReason: review.errorReason },
  });
}

const Patch = z.object({
  title: z.string().optional(),
  status: z.enum(['published']).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  const [review] = await db.select({ workspaceId: schema.reviews.workspaceId }).from(schema.reviews).where(eq(schema.reviews.id, id));
  if (!review) return new Response('Not found', { status: 404 });
  if (!review.workspaceId || !(await requireMember(review.workspaceId, user.id))) return new Response('Forbidden', { status: 403 });
  const body = Patch.parse(await req.json());
  const set: Record<string, unknown> = {};
  if (body.title !== undefined) set.title = body.title;
  if (body.status !== undefined) set.status = body.status;
  if (Object.keys(set).length > 0) await db.update(schema.reviews).set(set).where(eq(schema.reviews.id, id));
  return Response.json({ ok: true });
}
