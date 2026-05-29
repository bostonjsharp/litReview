import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { makeTestDb } from '../helpers/testdb';

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => { ctx = await makeTestDb(); });
afterAll(async () => { await ctx.sql.end(); });

describe('workspaces schema', () => {
  it('creates a workspace with a member and a workspace-scoped collection', async () => {
    const [u] = await ctx.db.insert(ctx.schema.users).values({ email: 'a@x.edu' }).returning();
    const [w] = await ctx.db.insert(ctx.schema.workspaces).values({ name: 'Lab', ownerId: u.id, inviteCode: 'abc123' }).returning();
    await ctx.db.insert(ctx.schema.workspaceMembers).values({ workspaceId: w.id, userId: u.id, role: 'owner' });
    const [c] = await ctx.db.insert(ctx.schema.collections).values({ name: 'NLP', workspaceId: w.id }).returning();
    expect(c.workspaceId).toBe(w.id);
    const members = await ctx.db.select().from(ctx.schema.workspaceMembers).where(and(eq(ctx.schema.workspaceMembers.workspaceId, w.id), eq(ctx.schema.workspaceMembers.userId, u.id)));
    expect(members[0].role).toBe('owner');
    await ctx.db.delete(ctx.schema.workspaces).where(eq(ctx.schema.workspaces.id, w.id));
    expect(await ctx.db.select().from(ctx.schema.workspaceMembers).where(eq(ctx.schema.workspaceMembers.workspaceId, w.id))).toHaveLength(0);
  });
});
