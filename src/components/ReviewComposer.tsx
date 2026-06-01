'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';

// ── Types ──────────────────────────────────────────────────────────────────

export interface Entry {
  id: string;
  position: number;
  kind: 'prose' | 'annotation';
  prose: string | null;
  annotationId: string | null;
}

export interface AnnInfo {
  quote: string;
  page: number | null;
  sourceLabel: string;
  themes: string[];
}

export interface Candidate {
  id: string;
  quote: string;
  page: number | null;
  sourceLabel: string;
}

export interface ComposerMeta {
  title: string;
  collectionId: string | null;
  collectionName: string | null;
  authorName: string;
  backHref: string;
}

interface Props {
  reviewId: string;
  initialEntries: Entry[];
  annLookup: Record<string, AnnInfo>;
  candidates: Candidate[];
  meta: ComposerMeta;
}

// ── Auto-grow textarea helper ───────────────────────────────────────────────

function autoGrow(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

// ── Block handle (move / delete) ────────────────────────────────────────────

interface BlockHandleProps {
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  busy: boolean;
}

function BlockHandle({ onMoveUp, onMoveDown, onDelete, busy }: BlockHandleProps) {
  return (
    <div className="block-handle">
      <button title="Move up" onClick={onMoveUp} disabled={busy}>
        <Icon name="chevronDown" size={14} style={{ transform: 'rotate(180deg)' }} />
      </button>
      {/* Drag handle is visual-only; pointer DnD is deferred per spec */}
      <button title="Drag (visual only)" style={{ cursor: 'grab' }} disabled>
        <Icon name="drag" size={14} />
      </button>
      <button title="Move down" onClick={onMoveDown} disabled={busy}>
        <Icon name="chevronDown" size={14} />
      </button>
      <button title="Remove" onClick={onDelete} disabled={busy}>
        <Icon name="trash" size={14} />
      </button>
    </div>
  );
}

// ── Read view ───────────────────────────────────────────────────────────────

function ReadView({
  entries,
  annLookup,
  title,
}: {
  entries: Entry[];
  annLookup: Record<string, AnnInfo>;
  title: string;
}) {
  return (
    <div className="composer-doc">
      <h1 className="reader-title" style={{ marginBottom: 8 }}>
        {title}
      </h1>
      {entries.map((e) => {
        if (e.kind === 'prose') {
          if (!e.prose?.trim()) return null;
          return (
            <p
              key={e.id}
              style={{
                fontFamily: 'var(--serif)',
                fontSize: 18,
                lineHeight: 1.7,
                color: 'var(--ink)',
                marginBottom: 20,
              }}
            >
              {e.prose}
            </p>
          );
        }
        if (e.kind === 'annotation' && e.annotationId) {
          const ann = annLookup[e.annotationId];
          if (!ann) return null;
          return (
            <div key={e.id} className="ann-card" style={{ marginBottom: 16 }}>
              <div className="ac-quote">&ldquo;{ann.quote}&rdquo;</div>
              <div className="ac-meta">
                <Icon name="quote" size={13} style={{ color: 'var(--accent)' }} />
                {ann.sourceLabel}
                {ann.page != null ? ` · p.${ann.page}` : ''}
                {ann.themes.map((t) => (
                  <span key={t}>{' '}#{t.toLowerCase().replace(/\s+/g, '-')}</span>
                ))}
              </div>
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export function ReviewComposer({
  reviewId,
  initialEntries,
  annLookup: initialAnnLookup,
  candidates: initialCandidates,
  meta,
}: Props) {
  const [entries, setEntries] = useState<Entry[]>(initialEntries);
  // annLookup is enriched client-side when annotation blocks are added from the rail
  const [annLookup, setAnnLookup] = useState<Record<string, AnnInfo>>(initialAnnLookup);
  // candidates list is stable (server-fetched); used annotations are excluded via railNotes
  const candidates = initialCandidates;

  // Local-only title: there is no API to rename a review; title edits are kept in state only.
  // SCOPE DECISION: title editing is local-only (deferred; no PATCH /reviews/:id endpoint).
  const [localTitle, setLocalTitle] = useState(meta.title);

  const [busy, setBusy] = useState(false);
  const [readView, setReadView] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track per-entry local prose text: prose blocks are CREATED via the API,
  // but editing an existing block's text is LOCAL-ONLY — there is no PATCH-prose endpoint.
  // SCOPE DECISION: prose text editing of existing blocks is not persisted.
  const [localProse, setLocalProse] = useState<Record<string, string>>({});

  // Refs for auto-grow textareas
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  // Re-fetch entries from API and merge local prose edits
  const reload = useCallback(async () => {
    try {
      const res = await fetch(`/api/reviews/${reviewId}/entries`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Entry[] = await res.json();
      setEntries(data.sort((a, b) => a.position - b.position));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reload entries');
    }
  }, [reviewId]);

  // Run auto-grow on all prose textareas after entries change (e.g. after reload).
  // Per-keystroke growth is handled by the ref callback + onInput handler.
  useEffect(() => {
    for (const el of Object.values(textareaRefs.current)) {
      if (el) autoGrow(el);
    }
  }, [entries]);

  // Derived: which annotation ids are currently used
  const usedAnnotationIds = new Set(
    entries.filter((e) => e.kind === 'annotation').map((e) => e.annotationId as string),
  );

  // Rail candidates = initial candidates minus any now used
  const railNotes = candidates.filter((c) => !usedAnnotationIds.has(c.id));

  // ── API mutations ─────────────────────────────────────────────────────────

  async function addProseBlock() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/reviews/${reviewId}/entries`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // SCOPE DECISION: prose block text starts empty; editing existing prose is local-only
        body: JSON.stringify({ kind: 'prose', prose: ' ' }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add prose block');
    } finally {
      setBusy(false);
    }
  }

  async function addAnnotationBlock(annotationId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/reviews/${reviewId}/entries`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'annotation', annotationId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Move the candidate from rail into the lookup (already in initialCandidates)
      const candidate = candidates.find((c) => c.id === annotationId);
      if (candidate && !annLookup[annotationId]) {
        setAnnLookup((prev) => ({
          ...prev,
          [annotationId]: {
            quote: candidate.quote,
            page: candidate.page,
            sourceLabel: candidate.sourceLabel,
            themes: [],
          },
        }));
      }
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add annotation block');
    } finally {
      setBusy(false);
    }
  }

  async function moveEntry(entryId: string, direction: 'up' | 'down') {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/reviews/${reviewId}/entries/${entryId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ direction }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to move block');
    } finally {
      setBusy(false);
    }
  }

  async function deleteEntry(entryId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/reviews/${reviewId}/entries/${entryId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // If it was a prose block, clean up local text state
      setLocalProse((prev) => {
        const next = { ...prev };
        delete next[entryId];
        return next;
      });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete block');
    } finally {
      setBusy(false);
    }
  }

  // ── Insert first available note ("Insert note" button) ────────────────────

  function insertFirstNote() {
    const first = railNotes[0];
    if (first) addAnnotationBlock(first.id);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const blockCount = entries.length;

  return (
    <div className="composer">
      {/* ── Main column ─────────────────────────────────────────────── */}
      <div className="composer-main">
        {/* Sticky topbar — reuses .reader-topbar styles */}
        <div className="reader-topbar">
          <Link href={meta.backHref} className="reader-back">
            <Icon name="chevronLeft" size={16} />
            {meta.collectionName ?? 'Back'}
          </Link>
          <div className="grow" />

          {/* Saved indicator (always shows; no dirty-state tracking needed — mutations re-fetch) */}
          <span className="badge badge-ready">
            <span className="dot" /> Saved
          </span>

          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setReadView((v) => !v)}
            aria-pressed={readView}
          >
            <Icon name="book" size={15} />
            {readView ? 'Edit' : 'Read view'}
          </button>

          {/* SCOPE DECISION: Publish button is a no-op stub — no publish endpoint exists yet. */}
          <button
            className="btn btn-primary btn-sm"
            disabled
            title="Coming soon"
            aria-label="Publish (coming soon)"
          >
            <Icon name="check" size={15} /> Publish
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div
            style={{
              background: 'var(--surface-2)',
              borderBottom: '1px solid var(--border)',
              padding: '8px 24px',
              fontSize: 13,
              color: 'var(--ink-2)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Icon name="x" size={14} style={{ color: 'var(--accent)' }} />
            {error}
            <button
              className="btn btn-quiet btn-sm"
              style={{ marginLeft: 'auto' }}
              onClick={() => setError(null)}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Read view or Editor */}
        {readView ? (
          <ReadView entries={entries} annLookup={annLookup} title={localTitle} />
        ) : (
          <div className="composer-doc">
            {/* Title — local-only; no API to rename a review */}
            <input
              className="composer-title-in"
              value={localTitle}
              onChange={(e) => setLocalTitle(e.target.value)}
              placeholder="Review title…"
              aria-label="Review title"
            />

            {/* Meta line */}
            <div className="composer-sub">
              {meta.collectionName && <span>Collection · {meta.collectionName}</span>}
              <span>{blockCount} {blockCount === 1 ? 'block' : 'blocks'}</span>
              <span>by {meta.authorName}</span>
            </div>

            {/* Block list */}
            {entries.map((entry) => (
              <div className="block" key={entry.id}>
                <BlockHandle
                  onMoveUp={() => moveEntry(entry.id, 'up')}
                  onMoveDown={() => moveEntry(entry.id, 'down')}
                  onDelete={() => deleteEntry(entry.id)}
                  busy={busy}
                />

                {entry.kind === 'prose' ? (
                  <div className="block-prose">
                    {/*
                     * Auto-growing Spectral textarea. Prose text of EXISTING blocks is local-only —
                     * there is no PATCH-prose endpoint. New prose blocks are created via POST (with
                     * a blank placeholder), then the user types into the textarea whose value is
                     * kept in localProse state. Persisting edited text is deferred per spec.
                     */}
                    <textarea
                      ref={(el) => {
                        textareaRefs.current[entry.id] = el;
                        if (el) {
                          el.value = localProse[entry.id] ?? entry.prose ?? '';
                          autoGrow(el);
                        }
                      }}
                      rows={2}
                      placeholder="Write your synthesis…"
                      disabled={busy}
                      onInput={(e) => {
                        const el = e.currentTarget;
                        autoGrow(el);
                        setLocalProse((prev) => ({ ...prev, [entry.id]: el.value }));
                      }}
                    />
                  </div>
                ) : entry.annotationId ? (
                  <div className="block-ann">
                    <div className="ann-card">
                      <div className="ac-quote">
                        &ldquo;{annLookup[entry.annotationId]?.quote ?? '…'}&rdquo;
                      </div>
                      <div className="ac-meta">
                        <Icon name="quote" size={13} style={{ color: 'var(--accent)' }} />
                        <span>{annLookup[entry.annotationId]?.sourceLabel ?? 'Source'}</span>
                        {annLookup[entry.annotationId]?.page != null && (
                          <span>· p.{annLookup[entry.annotationId]!.page}</span>
                        )}
                        {(annLookup[entry.annotationId]?.themes ?? []).map((t) => (
                          <span key={t}>
                            #{t.toLowerCase().replace(/\s+/g, '-')}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}

            {/* Add-block row */}
            <div className="block-add">
              <button
                className="btn btn-ghost btn-sm"
                onClick={addProseBlock}
                disabled={busy}
              >
                <Icon name="plus" size={14} /> Prose block
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={insertFirstNote}
                disabled={busy || railNotes.length === 0}
                title={railNotes.length === 0 ? 'No unused notes available' : 'Insert first available note'}
              >
                <Icon name="note" size={14} /> Insert note
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Right rail ──────────────────────────────────────────────── */}
      <aside className="composer-rail themed">
        <div className="rail-head">Your notes · drag to insert</div>

        {railNotes.length === 0 && (
          <p className="meta" style={{ fontSize: 12, color: 'var(--faint)', padding: '8px 0' }}>
            All notes added.
          </p>
        )}

        {railNotes.map((note) => (
          <div
            className="rail-note"
            key={note.id}
            onClick={() => !busy && addAnnotationBlock(note.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (!busy) addAnnotationBlock(note.id);
              }
            }}
            aria-label={`Add note to review: "${note.quote.slice(0, 60)}"`}
          >
            <div className="rn-q">&ldquo;{note.quote}&rdquo;</div>
            <div className="rn-add">
              <Icon name="plus" size={13} /> Add to review
            </div>
          </div>
        ))}
      </aside>
    </div>
  );
}
