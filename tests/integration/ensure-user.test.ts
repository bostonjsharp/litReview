import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from '../helpers/testdb';
import { ensureUser } from '@/lib/users';

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => { ctx = await makeTestDb(); });
afterAll(async () => { await ctx.sql.end(); });

function deps() {
  return { db: ctx.db, schema: ctx.schema };
}

describe('ensureUser', () => {
  it('creates the user row on first sight and returns it', async () => {
    const u = await ensureUser('new@example.com', 'New User', deps());
    expect(u.email).toBe('new@example.com');
    const rows = await ctx.db.select().from(ctx.schema.users).where(eq(ctx.schema.users.email, 'new@example.com'));
    expect(rows).toHaveLength(1);
  });

  it('is idempotent under concurrent first-login for the same email (no unique-violation crash)', async () => {
    const email = 'race@example.com';
    // Simulates a brand-new user whose first page fires several requests at once —
    // each calls ensureUser before any insert has committed. Must not throw, must
    // not duplicate, must converge on one row.
    const results = await Promise.all(
      Array.from({ length: 6 }, () => ensureUser(email, 'Race', deps())),
    );
    const ids = new Set(results.map((u) => u.id));
    expect(ids.size).toBe(1);
    const rows = await ctx.db.select().from(ctx.schema.users).where(eq(ctx.schema.users.email, email));
    expect(rows).toHaveLength(1);
  });
});
