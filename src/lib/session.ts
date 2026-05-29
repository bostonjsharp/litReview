import { and, eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { db, schema } from '@/db/client';

// Returns the current authenticated user (creating the row on first sight), or null
// if there is no authenticated session. Route handlers must return 401 on null —
// a thrown Response is NOT converted to a response by Next.js route handlers.
export async function requireUser() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return null;
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (existing) return existing;
  const [created] = await db.insert(schema.users).values({ email, name: session.user?.name ?? null }).returning();
  return created;
}

// Returns the user's membership row for a workspace, or null if they are not a member.
// Route handlers must return 403 on null.
export async function requireMember(workspaceId: string, userId: string): Promise<{ role: string } | null> {
  const [m] = await db
    .select({ role: schema.workspaceMembers.role })
    .from(schema.workspaceMembers)
    .where(and(eq(schema.workspaceMembers.workspaceId, workspaceId), eq(schema.workspaceMembers.userId, userId)));
  return m ?? null;
}
