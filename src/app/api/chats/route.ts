import { z } from 'zod';
import { db, schema } from '@/db/client';
import { requireUser, requireMember } from '@/lib/session';
import { createChat, listChats } from '@/lib/chat/sessions';

const CreateBody = z.object({
  workspaceId: z.string().uuid(),
  scopeKind: z.enum(['workspace', 'collection', 'paper']).optional(),
  scopeId: z.string().uuid().optional(),
});

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const body = CreateBody.parse(await req.json());
  if (!(await requireMember(body.workspaceId, user.id))) return new Response('Forbidden', { status: 403 });
  const chat = await createChat(
    { workspaceId: body.workspaceId, userId: user.id, title: 'New chat', scopeKind: body.scopeKind, scopeId: body.scopeId ?? null },
    { db, schema },
  );
  return Response.json({ id: chat.id }, { status: 201 });
}

export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const workspaceId = new URL(req.url).searchParams.get('workspaceId') ?? '';
  if (!workspaceId) return Response.json({ error: 'workspaceId required' }, { status: 400 });
  if (!(await requireMember(workspaceId, user.id))) return new Response('Forbidden', { status: 403 });
  const chats = await listChats(workspaceId, user.id, { db, schema });
  return Response.json({ chats });
}
