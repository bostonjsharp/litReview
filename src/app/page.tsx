import { redirect } from "next/navigation";
import Link from "next/link";
import { eq, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { db, schema } from "@/db/client";
import { Icon } from "@/components/ui/Icon";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { initials } from "@/lib/ui/display";
import { signOutAction } from "@/app/actions/auth";

export default async function Home() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) redirect("/login");
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  const memberships = user
    ? await db.select({ id: schema.workspaces.id, name: schema.workspaces.name, role: schema.workspaceMembers.role })
        .from(schema.workspaceMembers)
        .innerJoin(schema.workspaces, eq(schema.workspaceMembers.workspaceId, schema.workspaces.id))
        .where(eq(schema.workspaceMembers.userId, user.id))
    : [];
  if (memberships.length === 0) redirect("/onboarding");

  // counts per workspace
  const rows = await Promise.all(memberships.map(async (w) => {
    const [{ c }] = await db.select({ c: sql<number>`count(*)::int` }).from(schema.collections).where(eq(schema.collections.workspaceId, w.id));
    const [{ p }] = await db.select({ p: sql<number>`count(*)::int` }).from(schema.papers).where(eq(schema.papers.workspaceId, w.id));
    const [{ m }] = await db.select({ m: sql<number>`count(*)::int` }).from(schema.workspaceMembers).where(eq(schema.workspaceMembers.workspaceId, w.id));
    return { ...w, collections: c, papers: p, members: m };
  }));

  return (
    <div className="home-stage">
      <header className="home-top themed">
        <div className="auth-brand"><span className="brand-mark">LR</span><span className="brand-name serif">LitReview</span></div>
        <div className="row gap2"><ThemeToggle /><form action={signOutAction}><button className="btn btn-quiet btn-sm">Sign out</button></form></div>
      </header>
      <div className="home-wrap fade-enter">
        <div className="home-greet">
          <div className="eyebrow">Signed in as <Link href="/account" style={{ color: 'var(--accent)' }}>{email}</Link></div>
          <h1>Welcome back{user?.name ? `, ${user.name.split(" ")[0]}` : ""}.</h1>
          <p className="muted">Choose a workspace to continue.</p>
        </div>
        <div className="ws-list">
          {rows.map((w) => (
            <Link key={w.id} href={`/workspaces/${w.id}`} className="card card-hover ws-row">
              <span className="ws-mark">{initials(w.name)}</span>
              <div className="ws-row-main">
                <h3>{w.name}</h3>
                <div className="ws-row-stats meta">{w.collections} collections · {w.papers} papers · {w.members} members</div>
              </div>
              <span className={"role-tag " + (w.role === "owner" ? "role-owner" : "role-member")}>{w.role}</span>
              <Icon name="chevronRight" size={18} style={{ color: "var(--faint)" }} />
            </Link>
          ))}
        </div>
        <div className="home-add">
          <Link href="/onboarding" className="home-add-card"><Icon name="plus" size={18} /> Create a workspace</Link>
          <Link href="/onboarding" className="home-add-card"><Icon name="users" size={18} /> Join with a code</Link>
        </div>
      </div>
    </div>
  );
}
