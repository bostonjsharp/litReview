'use client';
import { useState } from 'react';

interface Suggestion { themes: string[]; assignments: { annotationId: string; themes: string[] }[] }

export function SuggestThemesPanel({ collectionId }: { collectionId: string }) {
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [status, setStatus] = useState('');

  async function suggest() {
    setStatus('Asking the model…');
    const res = await fetch(`/api/collections/${collectionId}/suggest-themes`, { method: 'POST' });
    if (!res.ok) {
      setStatus(`Error: ${(await res.json()).error ?? res.status}`);
      return;
    }
    setSuggestion(await res.json());
    setStatus('');
  }

  async function apply() {
    if (!suggestion) return;
    setStatus('Applying…');
    const byName = new Map<string, string>();
    for (const name of suggestion.themes) {
      const res = await fetch(`/api/collections/${collectionId}/themes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        const t = await res.json();
        byName.set(name, t.id);
      }
    }
    for (const a of suggestion.assignments) {
      for (const name of a.themes) {
        const themeId = byName.get(name);
        if (themeId) {
          await fetch(`/api/annotations/${a.annotationId}/themes`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ themeId }),
          });
        }
      }
    }
    setStatus('Applied. Reload the matrix to see the result.');
    setSuggestion(null);
  }

  return (
    <div style={{ margin: '16px 0' }}>
      <button onClick={suggest}>Suggest themes</button> {status}
      {suggestion && (
        <div style={{ background: '#f5f5f5', padding: 12, marginTop: 8 }}>
          <strong>Proposed themes:</strong> {suggestion.themes.join(', ')}
          <p>{suggestion.assignments.length} annotation assignments proposed.</p>
          <button onClick={apply}>Apply</button>
          <button onClick={() => setSuggestion(null)}>Discard</button>
        </div>
      )}
    </div>
  );
}
