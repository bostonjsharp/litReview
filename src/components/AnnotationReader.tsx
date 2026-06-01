'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { splitIntoSegments, resolveSelection } from '@/lib/annotate/offsets';
import { sliceSegment } from '@/lib/annotate/highlights';
import type { HlAnnotation } from '@/lib/annotate/highlights';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Annotation extends HlAnnotation {
  quote: string;
  comment: string;
  page: number;
  authorName: string;
  authorColor: string;
}

interface Theme {
  id: string;
  name: string;
}

interface PaperMeta {
  title: string;
  authors: string[];
  year: number | null;
  journal: string | null;
  doi: string | null;
}

interface Props {
  paperId: string;
  fullText: string;
  paper: PaperMeta;
  annotations: Annotation[];
  themes: Theme[];
  tagsByAnnotation: Record<string, string[]>;
  backHref: string;
  backLabel: string;
}

// ─── ThemePop ────────────────────────────────────────────────────────────────

function ThemePop({
  themes,
  activeThemeIds,
  onPick,
  close,
}: {
  themes: Theme[];
  activeThemeIds: string[];
  onPick: (id: string) => void;
  close: () => void;
}) {
  return (
    <>
      <div className="menu-scrim" onClick={close} />
      <div className="theme-pop fade-enter" style={{ top: 28, left: 0 }}>
        {themes.length === 0 && (
          <p style={{ padding: '8px 10px', fontSize: 13, color: 'var(--muted)' }}>
            No themes in this collection.
          </p>
        )}
        {themes.map((t) => (
          <button
            key={t.id}
            onClick={(e) => {
              e.stopPropagation();
              onPick(t.id);
            }}
          >
            <span className="tp-dot" /> {t.name}
            {activeThemeIds.includes(t.id) && (
              <Icon name="check" size={14} style={{ marginLeft: 'auto', color: 'var(--accent)' }} />
            )}
          </button>
        ))}
      </div>
    </>
  );
}

// ─── Main AnnotationReader ────────────────────────────────────────────────────

export function AnnotationReader({
  paperId,
  fullText,
  paper,
  annotations: initialAnnotations,
  themes,
  tagsByAnnotation: initialTagsByAnnotation,
  backHref,
  backLabel,
}: Props) {
  const segments = splitIntoSegments(fullText);

  // State
  const [annotations, setAnnotations] = useState<Annotation[]>(initialAnnotations);
  const [tagsByAnnotation, setTagsByAnnotation] = useState<Record<string, string[]>>(
    initialTagsByAnnotation,
  );
  const [activeId, setActiveId] = useState<string | null>(null);

  // Selection popover state
  const [sel, setSel] = useState<{
    quote: string;
    charStart: number;
    charEnd: number;
    x: number;
    y: number;
  } | null>(null);

  // Compose-note draft state
  const [draft, setDraft] = useState<{
    quote: string;
    charStart: number;
    charEnd: number;
    comment: string;
    themes: string[];
  } | null>(null);

  // In-flight save
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Theme pop: which note (or "draft") has its theme picker open
  const [themePopFor, setThemePopFor] = useState<string | null>(null);

  // Refs
  const docRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ─── Selection handling ────────────────────────────────────────────────────

  const onMouseUp = useCallback(() => {
    const s = window.getSelection();
    if (!s || s.isCollapsed || s.rangeCount === 0) return;

    const anchorEl = s.anchorNode?.parentElement?.closest('[data-base]') as HTMLElement | null;
    const focusEl = s.focusNode?.parentElement?.closest('[data-base]') as HTMLElement | null;
    if (!anchorEl || !focusEl) return;

    const { charStart, charEnd } = resolveSelection(
      { base: Number(anchorEl.dataset.base), local: s.anchorOffset },
      { base: Number(focusEl.dataset.base), local: s.focusOffset },
    );
    if (charEnd - charStart < 4) return;

    const range = s.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const host = docRef.current!.getBoundingClientRect();
    // position the popover centered above the selection
    const x = rect.left - host.left + rect.width / 2;
    const y = rect.top - host.top;

    setSel({
      quote: fullText.slice(charStart, charEnd),
      charStart,
      charEnd,
      x,
      y,
    });
  }, [fullText]);

  function startNote() {
    if (!sel) return;
    setDraft({ quote: sel.quote, charStart: sel.charStart, charEnd: sel.charEnd, comment: '', themes: [] });
    setSel(null);
    setSaveError(null);
    window.getSelection()?.removeAllRanges();
    // Scroll rail to top so compose card is visible, then focus textarea
    setTimeout(() => {
      railRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      textareaRef.current?.focus();
    }, 50);
  }

  function cancelDraft() {
    setDraft(null);
    setSaveError(null);
  }

  // ─── Save note ─────────────────────────────────────────────────────────────

  async function saveNote() {
    if (!draft) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch('/api/annotations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          paperId,
          charStart: draft.charStart,
          charEnd: draft.charEnd,
          quote: draft.quote,
          comment: draft.comment,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setSaveError(err.error || 'Failed to save note.');
        return;
      }
      const created = await res.json() as {
        id: string;
        charStart: number;
        charEnd: number;
        quote: string;
        comment: string;
        page: number;
        createdBy: string | null;
      };

      // Attach themes
      const themeErrors: string[] = [];
      for (const themeId of draft.themes) {
        try {
          const tr = await fetch(`/api/annotations/${created.id}/themes`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ themeId }),
          });
          if (!tr.ok) themeErrors.push(themeId);
        } catch {
          themeErrors.push(themeId);
        }
      }

      // Prepend to state
      const newAnn: Annotation = {
        id: created.id,
        charStart: created.charStart,
        charEnd: created.charEnd,
        quote: created.quote,
        comment: created.comment,
        page: created.page ?? 1,
        authorName: 'You',
        authorColor: 'var(--accent)',
      };
      setAnnotations((prev) => [newAnn, ...prev]);
      setTagsByAnnotation((prev) => ({
        ...prev,
        [created.id]: draft.themes.filter((t) => !themeErrors.includes(t)),
      }));
      setDraft(null);
      if (themeErrors.length > 0) {
        setSaveError(`Note saved, but failed to apply ${themeErrors.length} theme(s).`);
      }
    } catch (e) {
      setSaveError((e as Error).message || 'Network error.');
    } finally {
      setSaving(false);
    }
  }

  // ─── Theme toggling on draft ───────────────────────────────────────────────

  function toggleDraftTheme(themeId: string) {
    if (!draft) return;
    setDraft((d) => {
      if (!d) return d;
      const has = d.themes.includes(themeId);
      return { ...d, themes: has ? d.themes.filter((t) => t !== themeId) : [...d.themes, themeId] };
    });
  }

  // ─── Theme toggling on saved notes (via API) ───────────────────────────────

  async function addThemeToNote(annId: string, themeId: string) {
    try {
      const res = await fetch(`/api/annotations/${annId}/themes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ themeId }),
      });
      if (res.ok) {
        setTagsByAnnotation((prev) => ({
          ...prev,
          [annId]: [...(prev[annId] ?? []), themeId],
        }));
      }
    } catch {
      // silent — user can retry
    }
  }

  async function removeThemeFromNote(annId: string, themeId: string) {
    try {
      const res = await fetch(`/api/annotations/${annId}/themes/${themeId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setTagsByAnnotation((prev) => ({
          ...prev,
          [annId]: (prev[annId] ?? []).filter((t) => t !== themeId),
        }));
      }
    } catch {
      // silent
    }
  }

  // ─── Activate a mark → set active + scroll to note card ───────────────────

  function activateMark(annId: string) {
    setActiveId(annId);
    setTimeout(() => {
      document.getElementById('note-' + annId)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 30);
  }

  // ─── Clean up document-level listeners / scrim on unmount ─────────────────

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setSel(null);
        setThemePopFor(null);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ─── Render helpers ────────────────────────────────────────────────────────

  const themeMap = Object.fromEntries(themes.map((t) => [t.id, t]));

  function renderParagraph(segOffset: number, segText: string) {
    const hlAnns: HlAnnotation[] = annotations.map((a) => ({
      id: a.id,
      charStart: a.charStart,
      charEnd: a.charEnd,
    }));
    const parts = sliceSegment({ offset: segOffset, text: segText }, hlAnns);
    return parts.map((part, i) => {
      if (!part.annId) return part.text;
      const isActive = activeId === part.annId;
      return (
        <mark
          key={i}
          className={'hl' + (isActive ? ' active' : '')}
          onClick={(e) => {
            e.stopPropagation();
            activateMark(part.annId!);
          }}
          aria-label="Highlighted annotation"
        >
          {part.text}
        </mark>
      );
    });
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="reader">
      {/* ── Left: main reading area ── */}
      <div className="reader-main">
        {/* Topbar */}
        <div className="reader-topbar">
          <Link href={backHref} className="reader-back">
            <Icon name="chevronLeft" size={16} /> {backLabel}
          </Link>
          <div className="grow" />
          <span className="meta">{annotations.length} notes</span>
          <button className="btn-icon" title="Reading settings (coming soon)" aria-label="Reading settings">
            <Icon name="settings" size={17} />
          </button>
        </div>

        {/* Document */}
        <div className="reader-doc" ref={docRef} style={{ position: 'relative' }}>
          {/* Eyebrow */}
          <div className="reader-eyebrow">
            {paper.journal && <span>{paper.journal}</span>}
            {paper.journal && paper.year && <span>·</span>}
            {paper.year && <span>{paper.year}</span>}
          </div>

          <h1 className="reader-title">{paper.title}</h1>

          {paper.authors.length > 0 && (
            <div className="reader-byline">{paper.authors.join(', ')}</div>
          )}

          {paper.doi && (
            <div className="reader-doi mono">DOI {paper.doi}</div>
          )}

          {/* Body */}
          <div className="reader-body" onMouseUp={onMouseUp}>
            {fullText.trim() === '' ? (
              <p style={{ color: 'var(--muted)' }}>No text available for this paper.</p>
            ) : (
              segments.map((seg, i) => (
                <p key={seg.offset} data-base={seg.offset} className={i === 0 ? 'dropcap' : ''}>
                  {renderParagraph(seg.offset, seg.text)}
                </p>
              ))
            )}
          </div>

          {/* Selection popover */}
          {sel && (
            <div
              className="sel-pop"
              style={{ left: sel.x, top: sel.y - 8 }}
              onMouseDown={(e) => e.preventDefault()} // prevent selection loss
            >
              <button onClick={startNote}>
                <Icon name="highlighter" size={16} /> Highlight &amp; note
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Right: notes rail ── */}
      <aside className="notes-rail themed">
        <div className="notes-head">
          <h3>
            Notes <span className="meta">{annotations.length}</span>
          </h3>
          <button className="btn-icon" title="Filter by theme" aria-label="Filter by theme">
            <Icon name="filter" size={16} />
          </button>
        </div>

        <div className="notes-scroll" ref={railRef}>
          {/* ── Compose card (at top of rail when drafting) ── */}
          {draft && (
            <div className="note-compose fade-enter">
              <div className="nc-quote">&ldquo;{draft.quote}&rdquo;</div>
              <textarea
                ref={textareaRef}
                className="textarea"
                rows={3}
                autoFocus
                placeholder="What does this passage tell you?"
                value={draft.comment}
                onChange={(e) => setDraft((d) => d ? { ...d, comment: e.target.value } : d)}
                disabled={saving}
              />
              <div className="note-themes" style={{ marginTop: 10, position: 'relative' }}>
                {(draft.themes).map((tid) =>
                  themeMap[tid] ? (
                    <span className="chip" key={tid}>
                      {themeMap[tid].name}
                      <button
                        aria-label={`Remove theme ${themeMap[tid].name}`}
                        onClick={() => toggleDraftTheme(tid)}
                      >
                        <Icon name="x" size={11} />
                      </button>
                    </span>
                  ) : null,
                )}
                <button
                  className="chip chip-add"
                  onClick={() => setThemePopFor(themePopFor === 'draft' ? null : 'draft')}
                  aria-label="Add theme"
                >
                  <Icon name="plus" size={12} /> theme
                </button>
                {themePopFor === 'draft' && (
                  <ThemePop
                    themes={themes}
                    activeThemeIds={draft.themes}
                    onPick={(id) => {
                      toggleDraftTheme(id);
                    }}
                    close={() => setThemePopFor(null)}
                  />
                )}
              </div>
              {saveError && (
                <p style={{ color: 'var(--error, oklch(0.55 0.18 30))', fontSize: 12, marginTop: 6 }}>
                  {saveError}
                </p>
              )}
              <div className="row gap2" style={{ marginTop: 12 }}>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={saveNote}
                  disabled={saving}
                >
                  <Icon name="check" size={14} /> {saving ? 'Saving…' : 'Save note'}
                </button>
                <button className="btn btn-quiet btn-sm" onClick={cancelDraft} disabled={saving}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* ── Saved note cards ── */}
          {annotations.map((a) => {
            const noteThemeIds = tagsByAnnotation[a.id] ?? [];
            const isActive = activeId === a.id;
            return (
              <div
                key={a.id}
                id={'note-' + a.id}
                className={'note' + (isActive ? ' active' : '')}
                onClick={() => setActiveId(a.id)}
              >
                <div className="note-quote">&ldquo;{a.quote}&rdquo;</div>
                {a.comment && <div className="note-comment">{a.comment}</div>}

                <div className="note-themes" style={{ position: 'relative' }}>
                  {noteThemeIds.map((tid) =>
                    themeMap[tid] ? (
                      <span className="chip" key={tid}>
                        {themeMap[tid].name}
                        <button
                          aria-label={`Remove theme ${themeMap[tid].name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            removeThemeFromNote(a.id, tid);
                          }}
                        >
                          <Icon name="x" size={11} />
                        </button>
                      </span>
                    ) : null,
                  )}
                  <button
                    className="chip chip-add"
                    aria-label="Add theme"
                    onClick={(e) => {
                      e.stopPropagation();
                      setThemePopFor(themePopFor === a.id ? null : a.id);
                    }}
                  >
                    <Icon name="plus" size={12} /> tag
                  </button>
                  {themePopFor === a.id && (
                    <ThemePop
                      themes={themes}
                      activeThemeIds={noteThemeIds}
                      onPick={(id) => {
                        if (noteThemeIds.includes(id)) {
                          removeThemeFromNote(a.id, id);
                        } else {
                          addThemeToNote(a.id, id);
                        }
                      }}
                      close={() => setThemePopFor(null)}
                    />
                  )}
                </div>

                <div className="note-foot">
                  <Avatar name={a.authorName} color={a.authorColor} size={18} />
                  {a.authorName} · p.{a.page}
                </div>
              </div>
            );
          })}

          {annotations.length === 0 && !draft && (
            <p style={{ color: 'var(--faint)', fontSize: 13, padding: '8px 4px' }}>
              Select text in the paper to add a note.
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}
