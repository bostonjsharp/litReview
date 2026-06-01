import Link from 'next/link';
import type { Matrix } from '@/lib/themes/matrix';
import { Icon } from '@/components/ui/Icon';

export function MatrixGrid({ matrix, workspaceId }: { matrix: Matrix; workspaceId: string }) {
  if (matrix.themes.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 40px', color: 'var(--muted)' }}>
        <p style={{ fontSize: 16 }}>No themes yet. Use &ldquo;Suggest themes&rdquo; or create themes manually.</p>
      </div>
    );
  }

  // Compute per-theme paper counts: number of papers that have ≥1 note for that theme
  const themePaperCounts: Record<string, number> = {};
  for (const theme of matrix.themes) {
    let count = 0;
    for (const paper of matrix.papers) {
      const cells = matrix.cells[paper.id]?.[theme.id];
      if (cells && cells.length > 0) count++;
    }
    themePaperCounts[theme.id] = count;
  }

  return (
    <div className="matrix-scroll">
      <table className="matrix">
        <thead>
          <tr>
            <th className="corner">
              <div className="meta" style={{ textTransform: 'uppercase', letterSpacing: '.08em' }}>
                {matrix.papers.length} papers · {matrix.themes.length} themes
              </div>
            </th>
            {matrix.themes.map((t) => (
              <th key={t.id}>
                <div className="col-theme">
                  <span
                    style={{
                      display: 'inline-block',
                      width: 8,
                      height: 8,
                      borderRadius: 99,
                      background: 'var(--accent)',
                      flexShrink: 0,
                    }}
                  />
                  {t.name}
                </div>
                <div className="col-count">{themePaperCounts[t.id]} papers</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.papers.map((p) => (
            <tr key={p.id}>
              <th>
                <div className="row-paper-title">{p.title ?? 'Untitled'}</div>
                <div className="row-paper-meta">{/* metadata not available at this layer */}</div>
              </th>
              {matrix.themes.map((t) => {
                const notes = matrix.cells[p.id]?.[t.id];
                return (
                  <td key={t.id} className={notes && notes.length > 0 ? '' : 'empty'}>
                    {notes && notes.length > 0 ? (
                      notes.map((n) => (
                        <div className="cell-note" key={n.id}>
                          <div className="cn-q">&ldquo;{n.quote}&rdquo;</div>
                          {n.page != null && (
                            <div className="cn-p">
                              <Icon name="link" size={11} />
                              <Link href={`/workspaces/${workspaceId}/papers/${p.id}`}>
                                p.{n.page}
                              </Link>
                            </div>
                          )}
                          {n.page == null && (
                            <div className="cn-p">
                              <Icon name="link" size={11} />
                              <Link href={`/workspaces/${workspaceId}/papers/${p.id}`}>
                                view
                              </Link>
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <Link
                        href={`/workspaces/${workspaceId}/papers/${p.id}`}
                        className="cell-empty-add"
                        title="Add note"
                      >
                        <Icon name="plus" size={16} />
                      </Link>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
