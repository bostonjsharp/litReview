import { redirect, notFound } from "next/navigation";
import { eq, and } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { requireUser } from "@/lib/session";
import { Sidebar } from "@/components/chrome/Sidebar";
import { Topbar } from "@/components/chrome/Topbar";

export default async function AppShellLayout({
  children, params,
}: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!user) redirect("/login");

  const [ws] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, id));
  if (!ws) notFound();
  const [membership] = await db.select().from(schema.workspaceMembers)
    .where(and(eq(schema.workspaceMembers.workspaceId, id), eq(schema.workspaceMembers.userId, user.id)));
  if (!membership) redirect("/");

  const collections = await db.select({ id: schema.collections.id, name: schema.collections.name })
    .from(schema.collections).where(eq(schema.collections.workspaceId, id));
  const memberRows = await db.select().from(schema.workspaceMembers)
    .where(eq(schema.workspaceMembers.workspaceId, id));
  const allWs = await db.select({ id: schema.workspaces.id, name: schema.workspaces.name })
    .from(schema.workspaceMembers)
    .innerJoin(schema.workspaces, eq(schema.workspaceMembers.workspaceId, schema.workspaces.id))
    .where(eq(schema.workspaceMembers.userId, user.id));

  return (
    <div className="app-shell">
      <Sidebar workspaceId={id} collections={collections} />
      <div className="app-main">
        <Topbar
          workspace={{ id, name: ws.name, role: membership.role, memberCount: memberRows.length }}
          workspaces={allWs}
          userName={user.name || user.email}
        />
        <div className="app-scroll">
          <div className="app-canvas fade-enter">{children}</div>
        </div>
      </div>
    </div>
  );
}
