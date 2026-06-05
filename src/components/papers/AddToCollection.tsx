'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';

export function AddToCollection({
  paperId,
  collections,
  memberOf,
}: {
  paperId: string;
  collections: { id: string; name: string }[];
  memberOf: string[];
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const available = collections.filter((c) => !memberOf.includes(c.id));

  async function add(collectionId: string) {
    setBusy(true);
    await fetch(`/api/papers/${paperId}/collections`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ collectionId }),
    });
    setBusy(false);
    setOpen(false);
    router.refresh();
  }

  if (available.length === 0) return null;
  return (
    <span style={{ position: 'relative' }}>
      <button className="btn btn-quiet btn-sm" onClick={() => setOpen((o) => !o)} disabled={busy}>
        <Icon name="plus" size={13} /> Add to collection
      </button>
      {open && (
        <>
          <div className="menu-scrim" onClick={() => setOpen(false)} />
          <div className="theme-pop fade-enter" style={{ top: 30, right: 0 }}>
            {available.map((c) => (
              <button key={c.id} onClick={() => add(c.id)} disabled={busy}>
                <span className="tp-dot" /> {c.name}
              </button>
            ))}
          </div>
        </>
      )}
    </span>
  );
}
