'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Icon } from '@/components/ui/Icon';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { RetryButton } from '@/components/workspace/RetryButton';

interface Collection {
  id: string;
  name: string;
}

type ItemStatus = 'pending' | 'processing' | 'ready' | 'failed' | 'metadata_only' | 'published';

interface QueueItem {
  id: string;
  name: string;
  status: ItemStatus;
  kind: 'paper' | 'review';
  pct: number;
  errorReason?: string | null;
}

const TERMINAL: ItemStatus[] = ['ready', 'failed', 'metadata_only', 'published'];
const POLL_INTERVAL = 2500;

export function UploadForm({
  workspaceId,
  collections,
}: {
  workspaceId: string;
  collections: Collection[];
}) {
  const [kind, setKind] = useState<'paper' | 'review'>('paper');
  const [collectionId, setCollectionId] = useState(collections[0]?.id ?? '');
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [mode, setMode] = useState<'file' | 'paste' | 'lookup'>('file');
  const [identifier, setIdentifier] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [preview, setPreview] = useState<
    { metadata: { title?: string; authors?: string[]; year?: number }; fullTextAvailable: boolean } | null
  >(null);
  const [pasteText, setPasteText] = useState('');
  const [title, setTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Keep a ref to the latest queue so the polling interval never closes over stale state.
  const queueRef = useRef<QueueItem[]>([]);

  // Sync queueRef whenever queue state changes.
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  // Poll non-terminal items every 2.5s. Papers hit GET /api/papers/[id] ({ paper: {...} }),
  // reviews hit GET /api/reviews/[id] ({ review: {...} }) — both carry { status, errorReason }.
  // Polling stops when status reaches a terminal state ('ready' | 'failed' | 'metadata_only').
  //
  // A single stable interval is set up on mount and reads queueRef.current on every tick,
  // so status updates never reset the cadence.
  const pollNonTerminal = useCallback(() => {
    const needsPoll = queueRef.current.filter((item) => !TERMINAL.includes(item.status));
    if (needsPoll.length === 0) return;

    needsPoll.forEach((item) => {
      const url = item.kind === 'review' ? `/api/reviews/${item.id}` : `/api/papers/${item.id}`;
      fetch(url)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          const record = item.kind === 'review' ? data?.review : data?.paper;
          if (!record?.status) return;
          const status: ItemStatus = record.status as ItemStatus;
          const errorReason: string | null = record.errorReason ?? null;
          setQueue((q) =>
            q.map((qi) =>
              qi.id === item.id
                ? { ...qi, status, pct: status === 'ready' ? 100 : qi.pct, errorReason }
                : qi,
            ),
          );
        })
        .catch(() => {
          /* silently ignore poll errors */
        });
    });
  }, []);

  // One stable interval — runs forever, no-ops when nothing is active.
  useEffect(() => {
    const id = setInterval(pollNonTerminal, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [pollNonTerminal]);

  async function handleUpload(file?: File) {
    if (uploading) return;
    if (!file && !pasteText.trim()) return;
    // Reviews must land in a collection or they become unfindable (mirrors the server guard).
    if (kind === 'review' && !collectionId) {
      setUploadError('Pick a collection for this review so it can be found later.');
      return;
    }

    setUploading(true);
    setUploadError(null);

    const fd = new FormData();
    fd.append('kind', kind);
    fd.append('workspaceId', workspaceId);
    if (collectionId) fd.append('collectionId', collectionId);
    if (title.trim()) fd.append('title', title.trim());
    if (file) fd.append('file', file);
    if (pasteText.trim()) fd.append('text', pasteText.trim());

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setUploadError(body.error || `Upload failed (${res.status})`);
        return;
      }
      const { id } = await res.json();
      const name = file ? file.name : title.trim() || `Pasted ${kind}`;
      setQueue((prev) => [
        { id, name, status: 'pending', kind, pct: 0 },
        ...prev,
      ]);
      // Reset form
      setTitle('');
      setPasteText('');
      setMode('file');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch {
      setUploadError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  async function handleLookup() {
    if (!identifier.trim()) return;
    setLookupLoading(true);
    setLookupError(null);
    setPreview(null);
    try {
      const res = await fetch('/api/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLookupError(data.error || `Lookup failed (${res.status})`);
        return;
      }
      setPreview({ metadata: data.metadata, fullTextAvailable: data.fullTextAvailable });
    } catch {
      setLookupError('Lookup failed. Please try again.');
    } finally {
      setLookupLoading(false);
    }
  }

  async function handleImport() {
    if (uploading) return;
    setUploading(true);
    setLookupError(null);
    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: identifier.trim(),
          workspaceId,
          collectionId: collectionId || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLookupError(data.error || `Import failed (${res.status})`);
        return;
      }
      const name = preview?.metadata.title || identifier.trim();
      setQueue((prev) => [{ id: data.id, name, status: data.status, kind: 'paper', pct: 0 }, ...prev]);
      setIdentifier('');
      setPreview(null);
      setMode('file');
    } catch {
      setLookupError('Import failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  function selectKind(next: 'paper' | 'review') {
    setKind(next);
    // Lookup is paper-only; leaving paper while in lookup mode would strand the panel.
    if (next === 'review' && mode === 'lookup') {
      setMode('file');
      setIdentifier('');
      setPreview(null);
      setLookupError(null);
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  return (
    <>
      <div className="row spread" style={{ marginBottom: 20, marginTop: 24 }}>
        <div className="seg">
          <button
            className={kind === 'paper' ? 'on' : ''}
            onClick={() => selectKind('paper')}
            type="button"
          >
            <Icon name="book" size={16} /> Paper
          </button>
          <button
            className={kind === 'review' ? 'on' : ''}
            onClick={() => selectKind('review')}
            type="button"
          >
            <Icon name="file" size={16} /> Review
          </button>
        </div>
        {collections.length > 0 && (
          <div className="field" style={{ minWidth: 280 }}>
            <div className="row gap2">
              <label htmlFor="upload-collection" className="label" style={{ whiteSpace: 'nowrap' }}>
                Collection
              </label>
              <select
                id="upload-collection"
                className="input"
                value={collectionId}
                onChange={(e) => setCollectionId(e.target.value)}
                style={{ height: 40 }}
              >
                <option value="">— none —</option>
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      <div
        className="dropzone"
        role="button"
        aria-label={`Drop a ${kind === 'paper' ? 'PDF' : 'review document'} here or click to browse files`}
        tabIndex={mode === 'file' ? 0 : -1}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onClick={() => mode === 'file' && fileInputRef.current?.click()}
        onKeyDown={(e) => { if (mode === 'file' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); fileInputRef.current?.click(); } }}
        style={{ cursor: mode === 'file' ? 'pointer' : 'default' }}
      >
        <div className="di">
          <Icon name="upload" size={26} />
        </div>
        <h3>Drop a {kind === 'paper' ? 'PDF' : 'review document'} here</h3>
        <p>
          or{' '}
          <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
            browse your files
          </span>{' '}
          · up to 40 MB
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          aria-label="Upload PDF"
          style={{ display: 'none' }}
          onChange={onFileChange}
        />
        {mode === 'file' && (
          <div className="or-paste">
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMode('paste');
              }}
            >
              <Icon name="note" size={14} /> Paste text instead
            </button>
            {kind === 'paper' && (
              <button
                className="btn btn-ghost btn-sm"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMode('lookup');
                }}
              >
                <Icon name="book" size={14} /> Import by DOI / arXiv
              </button>
            )}
          </div>
        )}
      </div>

      {mode === 'paste' && (
        <div className="field" style={{ marginTop: 16 }}>
          <input
            className="input"
            placeholder="Title (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ marginBottom: 8 }}
          />
          <textarea
            className="textarea"
            placeholder="Paste the full text here…"
            rows={8}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
          />
          <div className="row gap2" style={{ marginTop: 10 }}>
            <button
              className="btn btn-primary"
              type="button"
              disabled={uploading || !pasteText.trim()}
              onClick={() => handleUpload()}
            >
              {uploading ? 'Uploading…' : 'Submit text'}
            </button>
            <button
              className="btn btn-quiet btn-sm"
              type="button"
              onClick={() => {
                setMode('file');
                setPasteText('');
                setTitle('');
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === 'lookup' && (
        <div className="field" style={{ marginTop: 16 }}>
          <div className="row gap2">
            <input
              className="input"
              placeholder="Paste a DOI or arXiv id / URL…"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleLookup(); } }}
              style={{ flex: 1 }}
            />
            <button
              className="btn btn-primary"
              type="button"
              disabled={lookupLoading || !identifier.trim()}
              onClick={handleLookup}
            >
              {lookupLoading ? 'Looking up…' : 'Look up'}
            </button>
            <button
              className="btn btn-quiet btn-sm"
              type="button"
              onClick={() => { setMode('file'); setIdentifier(''); setPreview(null); setLookupError(null); }}
            >
              Cancel
            </button>
          </div>

          {lookupError && (
            <p className="meta" style={{ color: 'var(--danger)', marginTop: 10 }}>{lookupError}</p>
          )}

          {preview && (
            <div className="card" style={{ marginTop: 12, padding: 14 }}>
              <div style={{ fontWeight: 600, color: 'var(--ink)' }}>
                {preview.metadata.title || 'Untitled'}
              </div>
              <div className="meta" style={{ marginTop: 4 }}>
                {(preview.metadata.authors || []).join(', ')}
                {preview.metadata.year ? ` · ${preview.metadata.year}` : ''}
              </div>
              <div className="meta" style={{ marginTop: 8, color: preview.fullTextAvailable ? 'var(--accent)' : 'var(--muted)' }}>
                {preview.fullTextAvailable
                  ? '✓ Full text available — will be ingested for chat'
                  : 'Metadata only — no open-access full text (upload the PDF later to enable chat)'}
              </div>
              <div className="row gap2" style={{ marginTop: 12 }}>
                <button className="btn btn-primary" type="button" disabled={uploading} onClick={handleImport}>
                  {uploading ? 'Importing…' : 'Import'}
                </button>
                <button
                  className="btn btn-quiet btn-sm"
                  type="button"
                  onClick={() => setPreview(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {uploadError && (
        <p className="meta" style={{ color: 'var(--danger)', marginTop: 10 }}>
          {uploadError}
        </p>
      )}

      <div className="meta" style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="layers" size={14} /> Importing into workspace{' '}
        <span className="mono">{workspaceId}</span>
      </div>

      {queue.length > 0 && (
        <>
          <div className="list-head">
            <h2>
              Recent imports <span className="count">{queue.length}</span>
            </h2>
          </div>
          <div className="card list-card queue">
            {queue.map((item) => (
              <div className="queue-item" key={item.id}>
                <div
                  className="placeholder paper-thumb"
                  style={{ display: 'grid', placeItems: 'center' }}
                >
                  <Icon name="file" size={16} />
                </div>
                <div className="paper-main" style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: 'var(--mono)',
                      fontSize: 13,
                      color: 'var(--ink)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {item.name}
                  </div>
                  {item.status === 'failed' && (
                    <div
                      className="meta"
                      style={{ color: 'var(--danger)', marginTop: 4 }}
                    >
                      {item.errorReason || "Couldn’t extract text — try a text-based PDF"}
                    </div>
                  )}
                </div>
                {item.status === 'processing' && (
                  <div className="q-prog">
                    <div className="q-bar">
                      <i style={{ width: `${item.pct}%` }} />
                    </div>
                  </div>
                )}
                <StatusBadge status={item.status} />
                {item.status === 'failed' && item.kind === 'paper' && (
                  <RetryButton
                    parentType="paper"
                    parentId={item.id}
                  />
                )}
                {item.status === 'failed' && item.kind === 'review' && (
                  <RetryButton
                    parentType="review"
                    parentId={item.id}
                  />
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
