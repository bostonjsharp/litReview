import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { db, schema } from '@/db/client';
import { joinByCode } from '@/lib/workspaces/service';

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const session = await auth();
  const email = session?.user?.email;
  if (!email) redirect('/login');
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (!user) redirect('/login');
  let workspaceId: string | null = null;
  try {
    const w = await joinByCode(code, user.id, { db, schema });
    workspaceId = w.id;
  } catch {
    return <main style={{ padding: 40 }}>This invite link is invalid or has been revoked.</main>;
  }
  redirect(`/workspaces/${workspaceId}`);
}
