import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from '../helpers/testdb';
import {
  createChat, listChats, getChat, listMessages, addMessage, setChatTitle, deleteChat,
} from '@/lib/chat/sessions';

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => { ctx = await makeTestDb(); });
afterAll(async () => { await ctx.sql.end(); });

function deps() { return { db: ctx.db, schema: ctx.schema }; }

async function seedUserWorkspace() {
  const [u] = await ctx.db.insert(ctx.schema.users).values({ email: `u${Math.random()}@x.io` }).returning();
  const [w] = await ctx.db.insert(ctx.schema.workspaces).values({ name: 'W', inviteCode: `c${Math.random()}` }).returning();
  return { userId: u.id, workspaceId: w.id };
}

describe('chat sessions service', () => {
  it('creates a chat and lists it for its owner only', async () => {
    const a = await seedUserWorkspace();
    const b = await seedUserWorkspace();
    const chat = await createChat({ workspaceId: a.workspaceId, userId: a.userId, title: 'New chat' }, deps());
    expect(chat.scopeKind).toBe('workspace');

    const mine = await listChats(a.workspaceId, a.userId, deps());
    expect(mine.map((c: any) => c.id)).toContain(chat.id);

    // Another user in (conceptually) the same place cannot see A's chat.
    const theirs = await listChats(a.workspaceId, b.userId, deps());
    expect(theirs.map((c: any) => c.id)).not.toContain(chat.id);
  });

  it('adds messages in order and bumps updatedAt so listChats re-sorts by recency', async () => {
    const a = await seedUserWorkspace();
    const older = await createChat({ workspaceId: a.workspaceId, userId: a.userId, title: 'older' }, deps());
    const newer = await createChat({ workspaceId: a.workspaceId, userId: a.userId, title: 'newer' }, deps());
    // Touch `older` last → it should sort first.
    await addMessage({ chatId: older.id, role: 'user', content: 'hello' }, deps());
    await addMessage({ chatId: older.id, role: 'assistant', content: 'hi there', citations: [] }, deps());

    const msgs = await listMessages(older.id, deps());
    expect(msgs.map((m: any) => m.role)).toEqual(['user', 'assistant']);

    const list = await listChats(a.workspaceId, a.userId, deps());
    const ids = list.map((c: any) => c.id);
    expect(ids.indexOf(older.id)).toBeLessThan(ids.indexOf(newer.id));
  });

  it('sets the title, and delete cascades to messages', async () => {
    const a = await seedUserWorkspace();
    const chat = await createChat({ workspaceId: a.workspaceId, userId: a.userId, title: 'New chat' }, deps());
    await setChatTitle(chat.id, 'A real title', deps());
    expect((await getChat(chat.id, deps())).title).toBe('A real title');

    await addMessage({ chatId: chat.id, role: 'user', content: 'q' }, deps());
    await deleteChat(chat.id, deps());
    expect(await getChat(chat.id, deps())).toBeUndefined();
    const orphans = await ctx.db.select().from(ctx.schema.chatMessages).where(eq(ctx.schema.chatMessages.chatId, chat.id));
    expect(orphans).toHaveLength(0);
  });
});
