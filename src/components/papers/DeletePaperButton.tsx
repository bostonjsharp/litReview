'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';

export function DeletePaperButton({ paperId, title }: { paperId: string; title: string }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function del() {
    if (
      !window.confirm(
        `Delete "${title}"? This permanently removes the paper, its notes, and its search index from the whole workspace. This cannot be undone.`,
      )
    ) {
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/papers/${paperId}`, { method: 'DELETE' });
    setBusy(false);
    if (res.ok) router.refresh();
  }

  return (
    <button
      className="btn btn-quiet btn-sm"
      onClick={del}
      disabled={busy}
      aria-label="Delete paper"
      title="Delete paper"
    >
      <Icon name="trash" size={14} />
    </button>
  );
}
