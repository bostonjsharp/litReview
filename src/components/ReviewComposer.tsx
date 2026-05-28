'use client';
import { useEffect, useState } from 'react';

interface Entry { id: string; position: number; kind: 'prose' | 'annotation'; prose: string | null; annotationId: string | null }

export function ReviewComposer({ reviewId }: { reviewId: string }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [prose, setProse] = useState('');

  async function reload() {
    const res = await fetch(`/api/reviews/${reviewId}/entries`);
    if (res.ok) setEntries(await res.json());
  }

  useEffect(() => {
    let active = true;
    fetch(`/api/reviews/${reviewId}/entries`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Entry[]) => {
        if (active) setEntries(data);
      });
    return () => {
      active = false;
    };
  }, [reviewId]);

  async function addProse() {
    if (!prose.trim()) return;
    await fetch(`/api/reviews/${reviewId}/entries`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'prose', prose }),
    });
    setProse('');
    reload();
  }
  async function move(entryId: string, direction: 'up' | 'down') {
    await fetch(`/api/reviews/${reviewId}/entries/${entryId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ direction }),
    });
    reload();
  }
  async function remove(entryId: string) {
    await fetch(`/api/reviews/${reviewId}/entries/${entryId}`, { method: 'DELETE' });
    reload();
  }

  return (
    <div>
      <ol>
        {entries.map((e) => (
          <li key={e.id}>
            {e.kind === 'prose' ? e.prose : <em>[annotation {e.annotationId}]</em>}
            <button onClick={() => move(e.id, 'up')}>↑</button>
            <button onClick={() => move(e.id, 'down')}>↓</button>
            <button onClick={() => remove(e.id)}>✕</button>
          </li>
        ))}
      </ol>
      <textarea value={prose} onChange={(e) => setProse(e.target.value)} rows={3} placeholder="Add a prose block…" />
      <button onClick={addProse}>Add prose</button>
    </div>
  );
}
