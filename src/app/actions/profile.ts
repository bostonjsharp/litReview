'use server';
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { db, schema } from '@/db/client';
import { ensureUser, setDisplayName } from '@/lib/users';

export async function updateDisplayNameAction(formData: FormData): Promise<void> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return;
  const user = await ensureUser(email, session.user?.name ?? null, { db, schema });
  await setDisplayName(user.id, String(formData.get('name') ?? ''), { db, schema });
  revalidatePath('/account');
}
