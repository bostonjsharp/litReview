'use client';
import { useEffect, useState } from 'react';

interface Member { userId: string; role: string; email: string }

export function MembersPanel({ workspaceId, inviteCode }: { workspaceId: string; inviteCode: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [code, setCode] = useState(inviteCode);

  useEffect(() => {
    let active = true;
    fetch(`/api/workspaces/${workspaceId}/members`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d: Member[]) => {
        if (active) setMembers(d);
      });
    return () => {
      active = false;
    };
  }, [workspaceId]);

  const link = typeof window !== 'undefined' ? `${window.location.origin}/join/${code}` : `/join/${code}`;

  async function regenerate() {
    const res = await fetch(`/api/workspaces/${workspaceId}/invite-code`, { method: 'POST' });
    if (res.ok) setCode((await res.json()).inviteCode);
  }

  return (
    <div>
      <h2>Invite</h2>
      <p>
        Share this link: <code>{link}</code>
      </p>
      <button onClick={() => navigator.clipboard?.writeText(link)}>Copy link</button>
      <button onClick={regenerate}>Regenerate (revokes old link)</button>
      <h2>Members</h2>
      <ul>
        {members.map((m) => (
          <li key={m.userId}>
            {m.email} — {m.role}
          </li>
        ))}
      </ul>
    </div>
  );
}
