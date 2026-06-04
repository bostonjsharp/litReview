import { db, schema } from '@/db/client';
import { requireUser } from '@/lib/session';
import { getChat, listMessages, deleteChat } from '@/lib/chat/sessions';

async function ownedChat(id: string, userId: string) {
  const chat = await getChat(id, { db, schema });
  if (!chat) return { error: 'Not found', status: 404 as const };
  if (chat.userId !== userId) return { error: 'Forbidden', status: 403 as const };
  return { chat };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  const res = await ownedChat(id, user.id);
  if ('error' in res) return new Response(res.error, { status: res.status });
  const messages = await listMessages(id, { db, schema });
  return Response.json({ chat: res.chat, messages });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  const res = await ownedChat(id, user.id);
  if ('error' in res) return new Response(res.error, { status: res.status });
  await deleteChat(id, { db, schema });
  return new Response(null, { status: 204 });
}
