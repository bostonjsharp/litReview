import { z } from 'zod';
import { db, schema } from '@/db/client';
import { requireUser } from '@/lib/session';
import { getLLM } from '@/lib/llm';
import { createAnnotation } from '@/lib/annotate/service';

const Body = z.object({
  paperId: z.string().uuid(),
  charStart: z.number().int().nonnegative(),
  charEnd: z.number().int().positive(),
  quote: z.string().default(''),
  comment: z.string().default(''),
});

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const body = Body.parse(await req.json());
  try {
    const ann = await createAnnotation({ ...body, createdBy: user.id }, { db, schema, llm: getLLM() });
    return Response.json(ann, { status: 201 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
