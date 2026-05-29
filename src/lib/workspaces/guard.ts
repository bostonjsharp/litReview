export interface Member {
  userId: string;
  role: 'owner' | 'member';
}

// A member can be removed unless they are the only remaining owner.
export function canRemoveMember(members: Member[], targetUserId: string): boolean {
  const target = members.find((m) => m.userId === targetUserId);
  if (!target) return false;
  if (target.role !== 'owner') return true;
  const owners = members.filter((m) => m.role === 'owner');
  return owners.length > 1;
}
