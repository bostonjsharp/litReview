import { eq } from 'drizzle-orm';

interface Deps {
  db: any;
  schema: any;
}

// Returns the user row for an email, creating it on first sight. Pure DB logic with
// no auth/next-auth import so it is unit-testable and safe to call concurrently.
export async function ensureUser(email: string, name: string | null, deps: Deps) {
  const { db, schema } = deps;
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (existing) return existing;
  // Concurrent first-login requests can both pass the check above, so the insert must
  // be idempotent: the loser of the race gets an empty `returning()` and re-selects the
  // winner's row rather than crashing on the unique-email constraint.
  const [created] = await db
    .insert(schema.users)
    .values({ email, name })
    .onConflictDoNothing({ target: schema.users.email })
    .returning();
  if (created) return created;
  const [row] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  return row;
}
