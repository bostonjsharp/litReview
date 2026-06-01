'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';

// Shape returned by POST /api/collections/[id]/suggest-themes
// (from src/lib/themes/suggest.ts — no rationale or per-theme count field)
interface SuggestionResponse {
  themes: string[];
  assignments: { annotationId: string; themes: string[] }[];
}

interface DerivedTheme {
  name: string;
  // Derived from assignments: count of assignments whose themes[] includes this name
  annotationCount: number;
}

export function SuggestThemesPanel({
  collectionId,
}: {
  collectionId: string;
  workspaceId?: string; // kept in props for future use (e.g. router.push navigation)
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState<string | null>(null); // theme name being added
  const [themes, setThemes] = useState<DerivedTheme[]>([]);
  const [assignments, setAssignments] = useState<{ annotationId: string; themes: string[] }[]>([]);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');

  async function suggest() {
    setLoading(true);
    setError('');
    setThemes([]);
    setAssignments([]);
    setAdded(new Set());
    try {
      const res = await fetch(`/api/collections/${collectionId}/suggest-themes`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `Error ${res.status}`);
        return;
      }
      const data: SuggestionResponse = await res.json();
      // Derive per-theme annotation counts from the assignments array
      const derived: DerivedTheme[] = data.themes.map((name) => ({
        name,
        annotationCount: data.assignments.filter((a) => a.themes.includes(name)).length,
      }));
      setThemes(derived);
      setAssignments(data.assignments);
      setOpen(true);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function addTheme(name: string) {
    if (applying || added.has(name)) return;
    setApplying(name);
    try {
      // 1. Create the theme in the collection
      const createRes = await fetch(`/api/collections/${collectionId}/themes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!createRes.ok) {
        const body = await createRes.json().catch(() => ({}));
        setError(body.error ?? `Could not create theme "${name}"`);
        return;
      }
      const created = await createRes.json();
      const themeId: string = created.id;

      // 2. Apply annotation assignments for this theme
      const relevantAssignments = assignments.filter((a) => a.themes.includes(name));
      for (const a of relevantAssignments) {
        await fetch(`/api/annotations/${a.annotationId}/themes`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ themeId }),
        });
      }

      setAdded((prev) => new Set([...prev, name]));
      router.refresh();
    } catch {
      setError(`Failed to add theme "${name}". Please try again.`);
    } finally {
      setApplying(null);
    }
  }

  function close() {
    setOpen(false);
  }

  return (
    <>
      <button
        className="btn btn-primary"
        onClick={suggest}
        disabled={loading}
        style={{ display: 'flex', alignItems: 'center', gap: 8 }}
      >
        <Icon name="sparkle" size={16} />
        {loading ? 'Thinking…' : 'Suggest themes'}
      </button>

      {error && !open && (
        <p style={{ color: 'var(--danger, red)', fontSize: 13, margin: '6px 0 0' }}>{error}</p>
      )}

      {open && (
        <>
          <div
            className="menu-scrim"
            style={{ background: 'rgba(10,20,15,.3)', zIndex: 49 }}
            onClick={close}
          />
          <div className="suggest-panel">
            <div className="suggest-head">
              <div className="sh-eye">
                <Icon name="sparkle" size={16} />
                <span className="eyebrow">AI suggestion</span>
              </div>
              <h2>Themes worth adding</h2>
              <p className="muted" style={{ fontSize: 13.5 }}>
                Proposed from patterns across your annotations. Review before applying.
              </p>
              {error && (
                <p style={{ color: 'var(--danger, red)', fontSize: 13, marginTop: 6 }}>{error}</p>
              )}
            </div>

            <div className="suggest-body">
              {themes.length === 0 ? (
                <p className="muted" style={{ textAlign: 'center', padding: 24 }}>
                  No themes suggested. Add more annotations first.
                </p>
              ) : (
                themes.map((t) => {
                  const isAdded = added.has(t.name);
                  const isApplying = applying === t.name;
                  return (
                    <div
                      className={'suggest-item' + (isAdded ? ' added' : '')}
                      key={t.name}
                    >
                      <div className="si-top">
                        <span className="si-name">{t.name}</span>
                        {isAdded ? (
                          <span className="chip">
                            <Icon name="check" size={12} /> Added
                          </span>
                        ) : (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => addTheme(t.name)}
                            disabled={!!applying}
                          >
                            <Icon name="plus" size={14} />
                            {isApplying ? 'Adding…' : 'Add'}
                          </button>
                        )}
                      </div>
                      {/* No rationale in the API response — omitted intentionally */}
                      <div className="si-count">{t.annotationCount} annotations match</div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="suggest-foot">
              <button className="btn btn-ghost btn-block" onClick={close}>
                Done
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
