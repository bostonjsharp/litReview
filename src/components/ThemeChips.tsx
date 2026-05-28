'use client';
import { useState } from 'react';

interface Theme { id: string; name: string }

export function ThemeChips({ annotationId, allThemes, initial }: { annotationId: string; allThemes: Theme[]; initial: string[] }) {
  const [tagged, setTagged] = useState<Set<string>>(new Set(initial));

  async function toggle(themeId: string) {
    if (tagged.has(themeId)) {
      await fetch(`/api/annotations/${annotationId}/themes/${themeId}`, { method: 'DELETE' });
      setTagged((s) => {
        const n = new Set(s);
        n.delete(themeId);
        return n;
      });
    } else {
      const res = await fetch(`/api/annotations/${annotationId}/themes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ themeId }),
      });
      if (res.ok) setTagged((s) => new Set(s).add(themeId));
    }
  }

  if (allThemes.length === 0) return null;
  return (
    <span style={{ marginLeft: 8 }}>
      {allThemes.map((t) => (
        <button key={t.id} onClick={() => toggle(t.id)} style={{ fontWeight: tagged.has(t.id) ? 700 : 400, marginRight: 4 }}>
          {tagged.has(t.id) ? '●' : '○'} {t.name}
        </button>
      ))}
    </span>
  );
}
