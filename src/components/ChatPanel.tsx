'use client';
import { useState } from 'react';

interface Citation {
  title: string;
  page: number | null;
}

export function ChatPanel() {
  const [q, setQ] = useState('');
  const [answer, setAnswer] = useState('');
  const [citations, setCitations] = useState<Citation[]>([]);
  async function ask() {
    setAnswer('Thinking…');
    setCitations([]);
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: q }),
    });
    const json = await res.json();
    setAnswer(json.answer);
    setCitations(json.citations ?? []);
  }
  return (
    <div>
      <textarea value={q} onChange={(e) => setQ(e.target.value)} rows={3} placeholder="Ask the corpus…" />
      <button onClick={ask}>Ask</button>
      <p>{answer}</p>
      {citations.length > 0 && (
        <ul>
          {citations.map((c, i) => (
            <li key={i}>
              {c.title}
              {c.page ? `, p.${c.page}` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
