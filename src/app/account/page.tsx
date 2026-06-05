import { redirect } from 'next/navigation';
import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { db, schema } from '@/db/client';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { initials } from '@/lib/ui/display';
import { signOutAction } from '@/app/actions/auth';
import { updateDisplayNameAction } from '@/app/actions/profile';

export default async function AccountPage() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) redirect('/login');

  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  const workspaces = user
    ? await db
        .select({ id: schema.workspaces.id, name: schema.workspaces.name, role: schema.workspaceMembers.role })
        .from(schema.workspaceMembers)
        .innerJoin(schema.workspaces, eq(schema.workspaceMembers.workspaceId, schema.workspaces.id))
        .where(eq(schema.workspaceMembers.userId, user.id))
    : [];
  const displayName = user?.name || email;

  return (
    <div className="home-stage">
      <header className="home-top themed">
        <Link className="auth-brand" href="/">
          <span className="brand-mark">LR</span>
          <span className="brand-name serif">LitReview</span>
        </Link>
        <div className="row gap2">
          <ThemeToggle />
          <form action={signOutAction}>
            <button className="btn btn-quiet btn-sm">Sign out</button>
          </form>
        </div>
      </header>

      <div className="home-wrap fade-enter">
        <div className="row gap3" style={{ alignItems: 'center', marginBottom: 24 }}>
          <Avatar name={displayName} size={56} />
          <div>
            <h1 style={{ margin: 0 }}>{displayName}</h1>
            <div className="meta">{email} · {user?.role ?? 'member'}</div>
          </div>
        </div>

        <div className="card" style={{ padding: 20, marginBottom: 24 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Display name</div>
          <form action={updateDisplayNameAction} className="row gap2">
            <input className="input" name="name" defaultValue={user?.name ?? ''} placeholder="Your name" style={{ flex: 1 }} />
            <button className="btn btn-primary" type="submit">
              <Icon name="check" size={15} /> Save
            </button>
          </form>
        </div>

        <div className="eyebrow" style={{ marginBottom: 8 }}>Your workspaces</div>
        <div className="ws-list">
          {workspaces.map((w) => (
            <Link key={w.id} href={`/workspaces/${w.id}`} className="card card-hover ws-row">
              <span className="ws-mark">{initials(w.name)}</span>
              <div className="ws-row-main"><h3>{w.name}</h3></div>
              <span className={'role-tag ' + (w.role === 'owner' ? 'role-owner' : 'role-member')}>{w.role}</span>
              <Icon name="chevronRight" size={18} style={{ color: 'var(--faint)' }} />
            </Link>
          ))}
        </div>

        <div style={{ marginTop: 24 }}>
          <Link href="/" className="btn btn-ghost"><Icon name="chevronLeft" size={16} /> Back to workspaces</Link>
        </div>
      </div>
    </div>
  );
}
