import { and, asc, desc, eq, sql } from 'drizzle-orm';

interface Deps {
  db: any;
  schema: any;
}

type ScopeKind = 'workspace' | 'collection' | 'paper';

export async function createChat(
  input: { workspaceId: string; userId: string; title: string; scopeKind?: ScopeKind; scopeId?: string | null },
  deps: Deps,
) {
  const { db, schema } = deps;
  const [row] = await db
    .insert(schema.chats)
    .values({
      workspaceId: input.workspaceId,
      userId: input.userId,
      title: input.title,
      scopeKind: input.scopeKind ?? 'workspace',
      scopeId: input.scopeId ?? null,
    })
    .returning();
  return row;
}

export async function listChats(workspaceId: string, userId: string, deps: Deps) {
  const { db, schema } = deps;
  return db
    .select()
    .from(schema.chats)
    .where(and(eq(schema.chats.workspaceId, workspaceId), eq(schema.chats.userId, userId)))
    .orderBy(desc(schema.chats.updatedAt));
}

export async function getChat(chatId: string, deps: Deps) {
  const { db, schema } = deps;
  const [row] = await db.select().from(schema.chats).where(eq(schema.chats.id, chatId));
  return row;
}

export async function listMessages(chatId: string, deps: Deps) {
  const { db, schema } = deps;
  return db
    .select()
    .from(schema.chatMessages)
    .where(eq(schema.chatMessages.chatId, chatId))
    .orderBy(asc(schema.chatMessages.createdAt));
}

export async function addMessage(
  input: { chatId: string; role: 'user' | 'assistant'; content: string; citations?: unknown },
  deps: Deps,
) {
  const { db, schema } = deps;
  const [row] = await db
    .insert(schema.chatMessages)
    .values({ chatId: input.chatId, role: input.role, content: input.content, citations: input.citations ?? null })
    .returning();
  // Bump with the DB clock (not JS new Date()) so ordering stays consistent with
  // createdAt/defaultNow(); mixing clocks mis-orders history under app↔DB clock skew.
  await db.update(schema.chats).set({ updatedAt: sql`now()` }).where(eq(schema.chats.id, input.chatId));
  return row;
}

export async function setChatTitle(chatId: string, title: string, deps: Deps) {
  const { db, schema } = deps;
  await db.update(schema.chats).set({ title }).where(eq(schema.chats.id, chatId));
}

export async function deleteChat(chatId: string, deps: Deps) {
  const { db, schema } = deps;
  await db.delete(schema.chats).where(eq(schema.chats.id, chatId));
}
