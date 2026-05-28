import { eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { db, schema } from '@/db/client';

export async function requireUser() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) throw new Response('Unauthorized', { status: 401 });
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (existing) return existing;
  const [created] = await db.insert(schema.users).values({ email, name: session.user?.name ?? null }).returning();
  return created;
}
