import { eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { requireUser } from '@/lib/session';

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
