'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function WorkspaceOnboarding() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [status, setStatus] = useState('');

  async function create() {
    const res = await fetch('/api/workspaces', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      const w = await res.json();
      router.push(`/workspaces/${w.id}`);
    } else setStatus('Could not create workspace');
  }
  async function join() {
    const res = await fetch('/api/workspaces/join', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (res.ok) {
      const w = await res.json();
      router.push(`/workspaces/${w.id}`);
    } else setStatus('Invalid invite code');
  }

  return (
    <div>
      <section>
        <h2>Create a workspace</h2>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Workspace name" />
        <button onClick={create} disabled={!name.trim()}>Create</button>
      </section>
      <section>
        <h2>Join a workspace</h2>
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Invite code" />
        <button onClick={join} disabled={!code.trim()}>Join</button>
      </section>
      <p>{status}</p>
    </div>
  );
}
