'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Icon } from '@/components/ui/Icon';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { RetryButton } from '@/components/workspace/RetryButton';

interface Collection {
  id: string;
  name: string;
}

type ItemStatus = 'pending' | 'processing' | 'ready' | 'failed';

interface QueueItem {
  id: string;
  name: string;
  status: ItemStatus;
  kind: 'paper' | 'review';
  pct: number;
}

const TERMINAL: ItemStatus[] = ['ready', 'failed'];
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
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [title, setTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll non-terminal paper items every 2.5s via GET /api/papers/[id].
  // NOTE: GET /api/papers/[id] returns { paper: { id, title, fullText }, annotations }
  // — it does NOT include a `status` field. Polling is therefore best-effort:
  // if the paper object comes back with a non-null fullText we infer "ready";
  // otherwise we leave the status at last-known. Reviews have no GET-by-id route
  // and are left at their last-known status with a manual queue-clear option.
  const pollNonTerminal = useCallback(() => {
    setQueue((prev) => {
      const needsPoll = prev.filter(
        (item) => item.kind === 'paper' && !TERMINAL.includes(item.status),
      );
      if (needsPoll.length === 0) return prev;

      needsPoll.forEach((item) => {
        fetch(`/api/papers/${item.id}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (!data) return;
            // Status is not in the response; infer from fullText presence.
            const inferred: ItemStatus = data.paper?.fullText ? 'ready' : 'processing';
            setQueue((q) =>
              q.map((qi) =>
                qi.id === item.id
                  ? { ...qi, status: inferred, pct: inferred === 'ready' ? 100 : qi.pct }
                  : qi,
              ),
            );
          })
          .catch(() => {
            /* silently ignore poll errors */
          });
      });
      return prev; // actual updates happen in the inner setQueue above
    });
  }, []);

  useEffect(() => {
    const hasActive = queue.some(
      (item) => item.kind === 'paper' && !TERMINAL.includes(item.status),
    );
    if (hasActive) {
      if (!intervalRef.current) {
        intervalRef.current = setInterval(pollNonTerminal, POLL_INTERVAL);
      }
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [queue, pollNonTerminal]);

  async function handleUpload(file?: File) {
    if (uploading) return;
    if (!file && !pasteText.trim()) return;

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
      setPasteMode(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch {
      setUploadError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
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
            onClick={() => setKind('paper')}
            type="button"
          >
            <Icon name="book" size={16} /> Paper
          </button>
          <button
            className={kind === 'review' ? 'on' : ''}
            onClick={() => setKind('review')}
            type="button"
          >
            <Icon name="file" size={16} /> Review
          </button>
        </div>
        {collections.length > 0 && (
          <div className="field" style={{ minWidth: 280 }}>
            <div className="row gap2">
              <span className="label" style={{ whiteSpace: 'nowrap' }}>
                Collection
              </span>
              <select
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
        onDrop={onDrop}
        onDragOver={onDragOver}
        onClick={() => !pasteMode && fileInputRef.current?.click()}
        style={{ cursor: pasteMode ? 'default' : 'pointer' }}
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
          style={{ display: 'none' }}
          onChange={onFileChange}
        />
        {!pasteMode && (
          <div className="or-paste">
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setPasteMode(true);
              }}
            >
              <Icon name="note" size={14} /> Paste text instead
            </button>
          </div>
        )}
      </div>

      {pasteMode && (
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
                setPasteMode(false);
                setPasteText('');
                setTitle('');
              }}
            >
              Cancel
            </button>
          </div>
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
                      Couldn&apos;t extract text — try a text-based PDF
                    </div>
                  )}
                  {item.kind === 'review' && !TERMINAL.includes(item.status) && (
                    <div className="meta" style={{ color: 'var(--muted)', marginTop: 4 }}>
                      Review processing status unavailable — refresh the page to check.
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
