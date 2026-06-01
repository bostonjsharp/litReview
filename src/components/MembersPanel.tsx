'use client';
import { useEffect, useState, useCallback } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { colorForId } from '@/lib/ui/display';

interface Member {
  userId: string;
  role: string;
  email: string;
  name: string | null;
}

export function MembersPanel({
  workspaceId,
  inviteCode: initialCode,
  currentUserId,
  isOwner,
  workspaceName,
}: {
  workspaceId: string;
  inviteCode: string;
  currentUserId: string;
  isOwner: boolean;
  workspaceName: string;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [code, setCode] = useState(initialCode);
  const [copied, setCopied] = useState(false);
  const [regen, setRegen] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadMembers = useCallback(() => {
    fetch(`/api/workspaces/${workspaceId}/members`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: Member[]) => setMembers(d))
      .catch(() => setError('Could not load members.'));
  }, [workspaceId]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  function copy() {
    const link =
      typeof window !== 'undefined'
        ? `${window.location.origin}/join/${code}`
        : `/join/${code}`;
    try {
      navigator.clipboard.writeText(link);
    } catch {
      /* fallback: silently skip on non-secure contexts */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  async function regenerate() {
    if (regen) return;
    setRegen(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/invite-code`, { method: 'POST' });
      if (res.ok) {
        const { inviteCode } = await res.json();
        setCode(inviteCode);
      } else {
        setError('Could not regenerate link.');
      }
    } catch {
      setError('Could not regenerate link.');
    } finally {
      setRegen(false);
    }
  }

  async function remove(userId: string) {
    if (removing) return;
    setRemoving(userId);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/members/${userId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setMembers((prev) => prev.filter((m) => m.userId !== userId));
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'Could not remove member.');
      }
    } catch {
      setError('Could not remove member.');
    } finally {
      setRemoving(null);
    }
  }

  return (
    <>
      {error && (
        <p className="meta" style={{ color: 'var(--danger)', marginBottom: 16 }}>
          {error}
        </p>
      )}

      <div className="card invite-card">
        <div className="il">
          <h3>Invite link</h3>
          <p>
            Anyone with this link can join {workspaceName} and access all of its collections.
          </p>
        </div>
        <div className="col gap3" style={{ alignItems: 'flex-end' }}>
          <div className="invite-box" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div className="invite-link">
              <Icon name="link" size={15} style={{ color: 'var(--faint)', flexShrink: 0 }} />
              <span className="pre">litreview.app/join/</span>
              <span className="code">{code}</span>
            </div>
            <button
              className="btn btn-primary"
              onClick={copy}
              style={{ width: 120, justifyContent: 'center' }}
            >
              {copied ? (
                <>
                  <Icon name="check" size={16} /> Copied ✓
                </>
              ) : (
                <>
                  <Icon name="copy" size={16} /> Copy
                </>
              )}
            </button>
          </div>
          {isOwner && (
            <button
              className="btn btn-quiet btn-sm"
              onClick={regenerate}
              disabled={regen}
            >
              <Icon name="refresh" size={14} /> {regen ? 'Regenerating…' : 'Regenerate link'}
            </button>
          )}
        </div>
      </div>

      <div className="list-head">
        <h2>
          People <span className="count">{members.length}</span>
        </h2>
      </div>
      <div className="card list-card">
        {members.map((m) => {
          const isYou = m.userId === currentUserId;
          const canRemove = isOwner && !isYou && m.role !== 'owner';
          return (
            <div className="member-row" key={m.userId}>
              <Avatar name={m.name || m.email} color={colorForId(m.userId)} size={40} />
              <div className="member-main" style={{ flex: 1, minWidth: 0 }}>
                <div className="mn" style={{ fontWeight: 600, fontSize: 14 }}>
                  {m.name || m.email}{' '}
                  {isYou && <span className="you-tag">(you)</span>}
                </div>
                <div
                  className="me"
                  style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--muted)' }}
                >
                  {m.email}
                </div>
              </div>
              <span
                className={
                  'role-tag ' + (m.role === 'owner' ? 'role-owner' : 'role-member')
                }
              >
                {m.role}
              </span>
              {canRemove && (
                <button
                  className="btn btn-sm btn-danger"
                  onClick={() => remove(m.userId)}
                  disabled={removing === m.userId}
                >
                  <Icon name="x" size={14} />{' '}
                  {removing === m.userId ? 'Removing…' : 'Remove'}
                </button>
              )}
            </div>
          );
        })}
        {members.length === 0 && (
          <div
            className="meta"
            style={{ padding: '24px 20px', textAlign: 'center' }}
          >
            Loading members…
          </div>
        )}
      </div>
    </>
  );
}
