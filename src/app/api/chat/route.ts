import { z } from 'zod';
import { db, schema } from '@/db/client';
import { requireUser, requireMember } from '@/lib/session';
import { getLLM } from '@/lib/llm';
import { answerQuestion } from '@/lib/chat/answer';

const Body = z.object({
  workspaceId: z.string().uuid(),
  query: z.string().min(1),
  scope: z
    .object({
      collectionId: z.string().uuid().optional(),
      parentType: z.enum(['paper', 'review']).optional(),
      parentId: z.string().uuid().optional(),
    })
    .optional(),
});

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const body = Body.parse(await req.json());
  if (!(await requireMember(body.workspaceId, user.id))) return new Response('Forbidden', { status: 403 });
  const scope = { ...body.scope, workspaceId: body.workspaceId };
  const result = await answerQuestion(body.query, getLLM(), db, { scope, schema });
  return Response.json(result);
}
