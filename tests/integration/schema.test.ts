import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { makeTestDb } from '../helpers/testdb';

let ctx: Awaited<ReturnType<typeof makeTestDb>>;
beforeAll(async () => {
  ctx = await makeTestDb();
});
afterAll(async () => {
  await ctx.sql.end();
});

describe('schema', () => {
  it('inserts a user, collection, and paper', async () => {
    const [u] = await ctx.db.insert(ctx.schema.users).values({ email: 'a@x.edu' }).returning();
    const [c] = await ctx.db.insert(ctx.schema.collections).values({ name: 'NLP', createdBy: u.id }).returning();
    const [p] = await ctx.db
      .insert(ctx.schema.papers)
      .values({ collectionId: c.id, title: 'Test', uploadedBy: u.id })
      .returning();
    expect(p.status).toBe('pending');
    expect(p.title).toBe('Test');
  });
});
