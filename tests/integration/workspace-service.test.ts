import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { makeTestDb } from '../helpers/testdb';
import {
  createWorkspace, listWorkspaces, getMembership, joinByCode,
  listMembers, removeMember, regenerateInviteCode,
} from '@/lib/workspaces/service';

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => { ctx = await makeTestDb(); });
afterAll(async () => { await ctx.sql.end(); });
const deps = () => ({ db: ctx.db, schema: ctx.schema });
const mkUser = async (email: string) => (await ctx.db.insert(ctx.schema.users).values({ email }).returning())[0];

describe('workspace service', () => {
  it('creates a workspace with the creator as owner and a unique code', async () => {
    const u = await mkUser('owner@x.edu');
    const w = await createWorkspace('Lab', u.id, deps());
    expect(w.inviteCode).toMatch(/^[A-Za-z0-9_-]{12,}$/);
    expect((await getMembership(w.id, u.id, deps()))?.role).toBe('owner');
    expect((await listWorkspaces(u.id, deps())).map((x: { id: string }) => x.id)).toEqual([w.id]);
  });

  it('lets another user join by code, idempotently', async () => {
    const owner = await mkUser('o2@x.edu');
    const joiner = await mkUser('j@x.edu');
    const w = await createWorkspace('Team', owner.id, deps());
    await joinByCode(w.inviteCode, joiner.id, deps());
    await joinByCode(w.inviteCode, joiner.id, deps());
    expect((await getMembership(w.id, joiner.id, deps()))?.role).toBe('member');
    expect(await listMembers(w.id, deps())).toHaveLength(2);
  });

  it('rejects an invalid invite code', async () => {
    const u = await mkUser('z@x.edu');
    await expect(joinByCode('does-not-exist', u.id, deps())).rejects.toThrow();
  });

  it('regenerating the code invalidates the old one; blocks removing the last owner', async () => {
    const owner = await mkUser('o3@x.edu');
    const w = await createWorkspace('W', owner.id, deps());
    const oldCode = w.inviteCode;
    const newCode = await regenerateInviteCode(w.id, deps());
    expect(newCode).not.toBe(oldCode);
    const stranger = await mkUser('s@x.edu');
    await expect(joinByCode(oldCode, stranger.id, deps())).rejects.toThrow();
    await expect(removeMember(w.id, owner.id, deps())).rejects.toThrow();
  });
});
