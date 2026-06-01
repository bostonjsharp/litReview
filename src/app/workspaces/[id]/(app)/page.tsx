import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';

export default async function WorkspaceDashboard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [w] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, id));
  if (!w) return <main style={{ padding: 40 }}>Workspace not found.</main>;
  const collections = await db.select().from(schema.collections).where(eq(schema.collections.workspaceId, id));
  return (
    <main style={{ padding: 40 }}>
      <h1>{w.name}</h1>
      <nav style={{ display: 'flex', gap: 16 }}>
        <Link href={`/workspaces/${id}/members`}>Members &amp; invite</Link>
        <Link href="/">All workspaces</Link>
      </nav>
      <h2>Collections</h2>
      <ul>
        {collections.map((c) => (
          <li key={c.id}>
            <Link href={`/workspaces/${id}/collections/${c.id}/matrix`}>{c.name}</Link>
          </li>
        ))}
      </ul>
      {collections.length === 0 && <p>No collections yet.</p>}
    </main>
  );
}
