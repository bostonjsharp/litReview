import { z } from 'zod';
import { db, schema } from '@/db/client';
import { requireUser } from '@/lib/session';
import { getLLM } from '@/lib/llm';
import { getChat, listMessages, addMessage, setChatTitle } from '@/lib/chat/sessions';
import { answerQuestion } from '@/lib/chat/answer';
import { titleFromQuestion } from '@/lib/chat/title';
import type { ChatMessage } from '@/lib/llm/types';
import type { RetrieveScope } from '@/lib/search/retrieve';

const Body = z.object({ content: z.string().min(1) });
const HISTORY_LIMIT = 8;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  const chat = await getChat(id, { db, schema });
  if (!chat) return new Response('Not found', { status: 404 });
  if (chat.userId !== user.id) return new Response('Forbidden', { status: 403 });
  const { content } = Body.parse(await req.json());

  const prior = await listMessages(id, { db, schema });
  if (prior.length === 0) await setChatTitle(id, titleFromQuestion(content), { db, schema });
  await addMessage({ chatId: id, role: 'user', content }, { db, schema });

  const history: ChatMessage[] = prior
    .slice(-HISTORY_LIMIT)
    .map((m: { role: 'user' | 'assistant'; content: string }) => ({ role: m.role, content: m.content }));

  const scope: RetrieveScope = {
    workspaceId: chat.workspaceId,
    collectionId: chat.scopeKind === 'collection' ? chat.scopeId ?? undefined : undefined,
    parentType: chat.scopeKind === 'paper' ? 'paper' : undefined,
    parentId: chat.scopeKind === 'paper' ? chat.scopeId ?? undefined : undefined,
  };

  let result;
  try {
    result = await answerQuestion(content, getLLM(), db, { scope, schema, history });
  } catch {
    return Response.json({ error: 'Failed to answer. Please try again.' }, { status: 502 });
  }

  const assistant = await addMessage(
    { chatId: id, role: 'assistant', content: result.answer, citations: result.citations },
    { db, schema },
  );
  return Response.json(
    { message: { id: assistant.id, role: 'assistant', content: assistant.content, citations: result.citations } },
    { status: 201 },
  );
}
