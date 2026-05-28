'use client';
import { useState } from 'react';

export function UploadForm() {
  const [status, setStatus] = useState('');
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('Uploading…');
    const res = await fetch('/api/upload', { method: 'POST', body: new FormData(e.currentTarget) });
    const json = await res.json();
    setStatus(res.ok ? `Queued (id ${json.id}). Processing in background.` : `Error: ${JSON.stringify(json)}`);
  }
  return (
    <form onSubmit={onSubmit}>
      <select name="kind">
        <option value="paper">Paper</option>
        <option value="review">Review</option>
      </select>
      <input name="title" placeholder="Title (optional)" />
      <input type="file" name="file" accept="application/pdf" />
      <textarea name="text" placeholder="…or paste text here" rows={6} />
      <button type="submit">Upload</button>
      <p>{status}</p>
    </form>
  );
}
