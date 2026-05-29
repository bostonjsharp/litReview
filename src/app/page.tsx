import Link from 'next/link';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { auth, signOut } from '@/auth';
import { db, schema } from '@/db/client';

export default async function Home() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) redirect('/login');
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  const workspaces = user
    ? await db
        .select({ id: schema.workspaces.id, name: schema.workspaces.name })
        .from(schema.workspaceMembers)
        .innerJoin(schema.workspaces, eq(schema.workspaceMembers.workspaceId, schema.workspaces.id))
        .where(eq(schema.workspaceMembers.userId, user.id))
    : [];
  if (workspaces.length === 0) redirect('/onboarding');
  return (
    <main style={{ padding: 40 }}>
      <h1>LitReview</h1>
      <p>Signed in as {email}</p>
      <h2>Your workspaces</h2>
      <ul>
        {workspaces.map((w) => (
          <li key={w.id}>
            <Link href={`/workspaces/${w.id}`}>{w.name}</Link>
          </li>
        ))}
      </ul>
      <Link href="/onboarding">+ Create or join a workspace</Link>
      <form
        action={async () => {
          'use server';
          await signOut({ redirectTo: '/login' });
        }}
      >
        <button type="submit">Sign out</button>
      </form>
    </main>
  );
}
