'use client';
import { useState } from 'react';
import { splitIntoSegments, resolveSelection } from '@/lib/annotate/offsets';

interface Annotation { id: string; charStart: number; charEnd: number; quote: string; comment: string }

export function AnnotationReader({ paperId, fullText, initial }: { paperId: string; fullText: string; initial: Annotation[] }) {
  const [annotations, setAnnotations] = useState<Annotation[]>(initial);
  const [pending, setPending] = useState<{ charStart: number; charEnd: number; quote: string } | null>(null);
  const [comment, setComment] = useState('');
  const segments = splitIntoSegments(fullText);

  function onMouseUp() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    const anchorEl = sel.anchorNode?.parentElement?.closest('[data-base]') as HTMLElement | null;
    const focusEl = sel.focusNode?.parentElement?.closest('[data-base]') as HTMLElement | null;
    if (!anchorEl || !focusEl) return;
    const { charStart, charEnd } = resolveSelection(
      { base: Number(anchorEl.dataset.base), local: sel.anchorOffset },
      { base: Number(focusEl.dataset.base), local: sel.focusOffset },
    );
    if (charEnd <= charStart) return;
    setPending({ charStart, charEnd, quote: fullText.slice(charStart, charEnd) });
    setComment('');
  }

  async function save() {
    if (!pending) return;
    const res = await fetch('/api/annotations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ paperId, ...pending, comment }),
    });
    if (res.ok) {
      const created = (await res.json()) as Annotation;
      setAnnotations((a) => [...a, created]);
    }
    setPending(null);
  }

  return (
    <div>
      <div onMouseUp={onMouseUp} style={{ lineHeight: 1.6, maxWidth: 700 }}>
        {segments.map((s) => (
          <p key={s.offset} data-base={s.offset}>{s.text}</p>
        ))}
      </div>
      {pending && (
        <div style={{ position: 'sticky', bottom: 0, background: '#eee', padding: 12 }}>
          <p><em>&ldquo;{pending.quote}&rdquo;</em></p>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="Your note…" />
          <button onClick={save}>Save note</button>
          <button onClick={() => setPending(null)}>Cancel</button>
        </div>
      )}
      <h3>Notes ({annotations.length})</h3>
      <ul>
        {annotations.map((a) => (
          <li key={a.id}><strong>&ldquo;{a.quote}&rdquo;</strong> — {a.comment}</li>
        ))}
      </ul>
    </div>
  );
}
