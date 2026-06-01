import { redirect, notFound } from "next/navigation";
import { eq, and } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { requireUser } from "@/lib/session";

export default async function ImmersiveLayout({
  children, params,
}: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!user) redirect("/login");
  const [membership] = await db.select().from(schema.workspaceMembers)
    .where(and(eq(schema.workspaceMembers.workspaceId, id), eq(schema.workspaceMembers.userId, user.id)));
  if (!membership) notFound();
  return <div style={{ height: "100%" }}>{children}</div>;
}
