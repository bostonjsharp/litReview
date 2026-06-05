import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from '../helpers/testdb';
import { setDisplayName } from '@/lib/users';

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => { ctx = await makeTestDb(); });
afterAll(async () => { await ctx.sql.end(); });
function deps() { return { db: ctx.db, schema: ctx.schema }; }

describe('setDisplayName', () => {
  it('trims and sets the name; whitespace-only clears it to null', async () => {
    const [u] = await ctx.db.insert(ctx.schema.users).values({ email: `e${Math.random()}@x.io`, name: 'Old' }).returning();
    await setDisplayName(u.id, '  New Name  ', deps());
    let [row] = await ctx.db.select().from(ctx.schema.users).where(eq(ctx.schema.users.id, u.id));
    expect(row.name).toBe('New Name');
    await setDisplayName(u.id, '   ', deps());
    [row] = await ctx.db.select().from(ctx.schema.users).where(eq(ctx.schema.users.id, u.id));
    expect(row.name).toBeNull();
  });
});
