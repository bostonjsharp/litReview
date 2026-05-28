import { z } from 'zod';
import { db, schema } from '@/db/client';
import { requireUser } from '@/lib/session';

const Body = z.object({ reviewId: z.string().uuid(), paperId: z.string().uuid() });

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { reviewId, paperId } = Body.parse(await req.json());
  await db.insert(schema.reviewPaperLinks).values({ reviewId, paperId }).onConflictDoNothing();
  return Response.json({ ok: true }, { status: 201 });
}
