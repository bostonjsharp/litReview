import { and, eq } from 'drizzle-orm';
import { generateInviteCode } from './invite';
import { canRemoveMember, type Member } from './guard';

interface Deps {
  db: any;
  schema: any;
}

export async function createWorkspace(name: string, userId: string, deps: Deps) {
  const { db, schema } = deps;
  const [w] = await db
    .insert(schema.workspaces)
    .values({ name, ownerId: userId, inviteCode: generateInviteCode() })
    .returning();
  await db.insert(schema.workspaceMembers).values({ workspaceId: w.id, userId, role: 'owner' });
  return w;
}

export async function listWorkspaces(userId: string, deps: Deps) {
  const { db, schema } = deps;
  return db
    .select({ id: schema.workspaces.id, name: schema.workspaces.name, inviteCode: schema.workspaces.inviteCode })
    .from(schema.workspaceMembers)
    .innerJoin(schema.workspaces, eq(schema.workspaceMembers.workspaceId, schema.workspaces.id))
    .where(eq(schema.workspaceMembers.userId, userId));
}

export async function getMembership(workspaceId: string, userId: string, deps: Deps) {
  const { db, schema } = deps;
  const [m] = await db
    .select({ role: schema.workspaceMembers.role })
    .from(schema.workspaceMembers)
    .where(and(eq(schema.workspaceMembers.workspaceId, workspaceId), eq(schema.workspaceMembers.userId, userId)));
  return m ?? null;
}

export async function joinByCode(code: string, userId: string, deps: Deps) {
  const { db, schema } = deps;
  const [w] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.inviteCode, code));
  if (!w) throw new Error('invalid invite code');
  await db.insert(schema.workspaceMembers).values({ workspaceId: w.id, userId, role: 'member' }).onConflictDoNothing();
  return w;
}

export async function renameWorkspace(workspaceId: string, name: string, deps: Deps) {
  const { db, schema } = deps;
  const [w] = await db.update(schema.workspaces).set({ name }).where(eq(schema.workspaces.id, workspaceId)).returning();
  if (!w) throw new Error('workspace not found');
  return w;
}

export async function listMembers(workspaceId: string, deps: Deps) {
  const { db, schema } = deps;
  return db
    .select({ userId: schema.workspaceMembers.userId, role: schema.workspaceMembers.role, email: schema.users.email })
    .from(schema.workspaceMembers)
    .innerJoin(schema.users, eq(schema.workspaceMembers.userId, schema.users.id))
    .where(eq(schema.workspaceMembers.workspaceId, workspaceId));
}

export async function removeMember(workspaceId: string, userId: string, deps: Deps) {
  const { db, schema } = deps;
  const members: Member[] = await db
    .select({ userId: schema.workspaceMembers.userId, role: schema.workspaceMembers.role })
    .from(schema.workspaceMembers)
    .where(eq(schema.workspaceMembers.workspaceId, workspaceId));
  if (!canRemoveMember(members, userId)) throw new Error('cannot remove the only owner');
  await db
    .delete(schema.workspaceMembers)
    .where(and(eq(schema.workspaceMembers.workspaceId, workspaceId), eq(schema.workspaceMembers.userId, userId)));
}

export async function regenerateInviteCode(workspaceId: string, deps: Deps): Promise<string> {
  const { db, schema } = deps;
  const code = generateInviteCode();
  await db.update(schema.workspaces).set({ inviteCode: code }).where(eq(schema.workspaces.id, workspaceId));
  return code;
}

export async function deleteWorkspace(workspaceId: string, deps: Deps) {
  const { db, schema } = deps;
  await db.delete(schema.workspaces).where(eq(schema.workspaces.id, workspaceId));
}
