'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { splitIntoSegments, resolveSelection } from '@/lib/annotate/offsets';
import { sliceSegment, firstOccurrenceFlags } from '@/lib/annotate/highlights';
import type { HlAnnotation } from '@/lib/annotate/highlights';
import { matchesThemeFocus, isDimmed } from '@/lib/annotate/themeFilter';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { normalizeThemeName } from '@/lib/themes/name';

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
  collectionId: string | null;
  fullText: string;
  paper: PaperMeta;
  pageCount: number | null;
  annotations: Annotation[];
  themes: Theme[];
  tagsByAnnotation: Record<string, string[]>;
  backHref: string;
  backLabel: string;
}

// ─── Offset helpers ───────────────────────────────────────────────────────────

/**
 * Computes the number of rendered characters from the start of `container`
 * to `node` at `offset`. This correctly handles paragraphs that contain
 * multiple child nodes (e.g. plain text interleaved with <mark> elements),
 * because Range.toString() concatenates all text content within the range —
 * matching how splitIntoSegments / sliceSegment count characters.
 */
function localOffsetWithin(container: HTMLElement, node: Node, offset: number): number {
  const r = document.createRange();
  r.setStart(container, 0);
  r.setEnd(node, offset);
  return r.toString().length;
}

// ─── ThemePop ────────────────────────────────────────────────────────────────

function ThemePop({
  themes,
  activeThemeIds,
  onPick,
  close,
  canCreate,
  onCreate,
}: {
  themes: Theme[];
  activeThemeIds: string[];
  onPick: (id: string) => void;
  close: () => void;
  canCreate: boolean;
  onCreate: (name: string) => Promise<Theme | null>;
}) {
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  async function submitNew() {
    if (creating) return;
    setCreating(true);
    const theme = await onCreate(newName);
    setCreating(false);
    if (theme) {
      setNewName('');
      onPick(theme.id); // auto-select the freshly created theme
    }
  }

  return (
    <>
      <div className="menu-scrim" onClick={close} />
      <div className="theme-pop fade-enter" style={{ top: 28, left: 0 }}>
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
        {canCreate ? (
          <div className="theme-pop-new" style={{ display: 'flex', gap: 4, padding: '6px 8px' }}>
            <input
              className="input"
              style={{ height: 30, fontSize: 13 }}
              placeholder="New theme…"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.stopPropagation();
                  submitNew();
                }
              }}
              disabled={creating}
            />
            <button
              className="btn btn-primary btn-sm"
              onClick={(e) => {
                e.stopPropagation();
                submitNew();
              }}
              disabled={creating || normalizeThemeName(newName) === null}
              aria-label="Create theme"
            >
              <Icon name="plus" size={12} />
            </button>
          </div>
        ) : (
          // A paper with no collection has no collection-scoped themes to show or create.
          <p style={{ padding: '6px 10px', fontSize: 12, color: 'var(--faint)' }}>
            Add this paper to a collection to use themes.
          </p>
        )}
      </div>
    </>
  );
}

// ─── Main AnnotationReader ────────────────────────────────────────────────────

export function AnnotationReader({
  paperId,
  collectionId,
  fullText,
  paper,
  pageCount,
  annotations: initialAnnotations,
  themes: initialThemes,
  tagsByAnnotation: initialTagsByAnnotation,
  backHref,
  backLabel,
}: Props) {
  const segments = useMemo(() => splitIntoSegments(fullText), [fullText]);

  // State
  const [annotations, setAnnotations] = useState<Annotation[]>(initialAnnotations);
  const [themes, setThemes] = useState<Theme[]>(initialThemes);
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

  // Theme focus filter
  const [focusThemeId, setFocusThemeId] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);

  // Refs
  const docRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startNoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Selection handling ────────────────────────────────────────────────────

  const onMouseUp = useCallback(() => {
    const s = window.getSelection();
    if (!s || s.isCollapsed || s.rangeCount === 0) return;

    const anchorEl = s.anchorNode?.parentElement?.closest('[data-base]') as HTMLElement | null;
    const focusEl = s.focusNode?.parentElement?.closest('[data-base]') as HTMLElement | null;
    if (!anchorEl || !focusEl) return;

    const aLocal = localOffsetWithin(anchorEl, s.anchorNode!, s.anchorOffset);
    const fLocal = localOffsetWithin(focusEl, s.focusNode!, s.focusOffset);
    const { charStart, charEnd } = resolveSelection(
      { base: Number(anchorEl.dataset.base), local: aLocal },
      { base: Number(focusEl.dataset.base), local: fLocal },
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
    if (startNoteTimerRef.current != null) clearTimeout(startNoteTimerRef.current);
    startNoteTimerRef.current = setTimeout(() => {
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

  // Creates a collection theme inline and adds it to local state so every picker sees it.
  // Returns the new theme (so the caller can select it) or null on no-op/failure.
  async function createThemeInline(name: string): Promise<Theme | null> {
    if (!collectionId) return null;
    const clean = normalizeThemeName(name);
    if (!clean) return null;
    const res = await fetch(`/api/collections/${collectionId}/themes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: clean }),
    });
    if (!res.ok) return null;
    const theme = (await res.json()) as Theme;
    setThemes((prev) => (prev.some((t) => t.id === theme.id) ? prev : [...prev, theme]));
    return theme;
  }

  // ─── Activate a mark → set active + scroll to note card ───────────────────

  function activateMark(annId: string) {
    setActiveId(annId);
    if (activateTimerRef.current != null) clearTimeout(activateTimerRef.current);
    activateTimerRef.current = setTimeout(() => {
      document.getElementById('note-' + annId)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      document.getElementById('hl-' + annId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

  // ─── Clear pending scroll timers on unmount ────────────────────────────────

  useEffect(() => {
    return () => {
      if (activateTimerRef.current != null) clearTimeout(activateTimerRef.current);
      if (startNoteTimerRef.current != null) clearTimeout(startNoteTimerRef.current);
    };
  }, []);

  // Deep-link: ?ann=<id> scrolls to and flashes the highlight, and activates its note.
  useEffect(() => {
    const annId = new URLSearchParams(window.location.search).get('ann');
    if (!annId || !annotations.some((a) => a.id === annId)) return;
    const el = document.getElementById('hl-' + annId);
    if (!el) return;
    const activate = setTimeout(() => {
      setActiveId(annId);
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('hl-flash');
    }, 0);
    const removeFlash = setTimeout(() => el.classList.remove('hl-flash'), 1200);
    return () => {
      clearTimeout(activate);
      clearTimeout(removeFlash);
    };
  }, [annotations]);

  // ─── Render helpers ────────────────────────────────────────────────────────

  const themeMap = Object.fromEntries(themes.map((t) => [t.id, t]));

  const hlAnns = useMemo<HlAnnotation[]>(
    () => annotations.map((a) => ({ id: a.id, charStart: a.charStart, charEnd: a.charEnd })),
    [annotations],
  );

  // Parts per segment (computed once) + the set of "<si>:<pi>" positions that should
  // carry the #hl-<annId> anchor (the first rendered mark of each annotation).
  const segParts = useMemo(
    () => segments.map((seg) => sliceSegment({ offset: seg.offset, text: seg.text }, hlAnns)),
    [segments, hlAnns],
  );
  const anchoredPositions = useMemo(() => {
    const flat = segParts.flatMap((parts) => parts.map((p) => p.annId ?? null));
    const flags = firstOccurrenceFlags(flat);
    const set = new Set<string>();
    let k = 0;
    segParts.forEach((parts, si) => {
      parts.forEach((_p, pi) => {
        if (flags[k]) set.add(`${si}:${pi}`);
        k += 1;
      });
    });
    return set;
  }, [segParts]);

  function renderParagraph(si: number) {
    const parts = segParts[si];
    return parts.map((part, pi) => {
      if (!part.annId) return part.text;
      const isActive = activeId === part.annId;
      const dim = isDimmed(part.annId, focusThemeId, tagsByAnnotation);
      const anchored = anchoredPositions.has(`${si}:${pi}`);
      return (
        <mark
          key={pi}
          id={anchored ? `hl-${part.annId}` : undefined}
          className={'hl' + (isActive ? ' active' : '') + (dim ? ' hl-dim' : '')}
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            activateMark(part.annId!);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              activateMark(part.annId!);
            }
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
        </div>

        {/* Document */}
        <div className="reader-doc" ref={docRef} style={{ position: 'relative' }}>
          {/* Eyebrow */}
          <div className="reader-eyebrow">
            {[
              paper.journal,
              paper.year != null ? String(paper.year) : null,
              pageCount != null ? `${pageCount} pages` : null,
            ]
              .filter(Boolean)
              .flatMap((item, i) =>
                i === 0
                  ? [<span key={i}>{item}</span>]
                  : [<span key={`sep-${i}`}>·</span>, <span key={i}>{item}</span>],
              )}
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
                  {renderParagraph(i)}
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
        <div className="notes-head" style={{ position: 'relative' }}>
          <h3>
            Notes <span className="meta">{annotations.length}</span>
          </h3>
          <button
            className="btn-icon"
            title="Filter by theme"
            aria-label="Filter by theme"
            onClick={() => setFilterOpen((o) => !o)}
          >
            <Icon name="filter" size={16} />
          </button>
          {filterOpen && (
            <>
              <div className="menu-scrim" onClick={() => setFilterOpen(false)} />
              <div className="theme-pop fade-enter" style={{ top: 36, right: 0 }}>
                <button
                  onClick={() => {
                    setFocusThemeId(null);
                    setFilterOpen(false);
                  }}
                >
                  <span className="tp-dot" /> All themes
                  {focusThemeId === null && (
                    <Icon name="check" size={14} style={{ marginLeft: 'auto', color: 'var(--accent)' }} />
                  )}
                </button>
                {themes.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setFocusThemeId(t.id);
                      setFilterOpen(false);
                    }}
                  >
                    <span className="tp-dot" /> {t.name}
                    {focusThemeId === t.id && (
                      <Icon name="check" size={14} style={{ marginLeft: 'auto', color: 'var(--accent)' }} />
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="notes-scroll" ref={railRef}>
          {focusThemeId && (
            <div className="reader-filter-banner">
              <Icon name="filter" size={13} />
              <span>Focused: {themes.find((t) => t.id === focusThemeId)?.name ?? 'theme'}</span>
              <button
                className="btn btn-quiet btn-sm"
                style={{ marginLeft: 'auto' }}
                onClick={() => setFocusThemeId(null)}
              >
                Clear
              </button>
            </div>
          )}
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
                    canCreate={collectionId != null}
                    onCreate={createThemeInline}
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
          {annotations
            .filter((a) => matchesThemeFocus(a.id, focusThemeId, tagsByAnnotation))
            .map((a) => {
            const noteThemeIds = tagsByAnnotation[a.id] ?? [];
            const isActive = activeId === a.id;
            return (
              <div
                key={a.id}
                id={'note-' + a.id}
                className={'note' + (isActive ? ' active' : '')}
                role="button"
                tabIndex={0}
                onClick={() => activateMark(a.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    activateMark(a.id);
                  }
                }}
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
                      canCreate={collectionId != null}
                      onCreate={createThemeInline}
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
