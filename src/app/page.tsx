import Link from 'next/link';
import { auth, signOut } from '@/auth';

export default async function Home() {
  const session = await auth();
  return (
    <main style={{ padding: 40 }}>
      <h1>LitReview</h1>
      <p>Signed in as {session?.user?.email}</p>
      <nav style={{ display: 'flex', gap: 16 }}>
        <Link href="/upload">Upload</Link>
        <Link href="/chat">Chat</Link>
      </nav>
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
