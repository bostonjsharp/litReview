import Link from 'next/link';
import type { Matrix } from '@/lib/themes/matrix';

export function MatrixGrid({ matrix, workspaceId }: { matrix: Matrix; workspaceId: string }) {
  if (matrix.themes.length === 0) return <p>No themes yet. Create themes or use &ldquo;Suggest themes&rdquo;.</p>;
  return (
    <table border={1} cellPadding={6} style={{ borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th>Paper</th>
          {matrix.themes.map((t) => (
            <th key={t.id}>{t.name}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {matrix.papers.map((p) => (
          <tr key={p.id}>
            <td>{p.title ?? 'Untitled'}</td>
            {matrix.themes.map((t) => (
              <td key={t.id} style={{ verticalAlign: 'top', maxWidth: 280 }}>
                {(matrix.cells[p.id]?.[t.id] ?? []).map((cell) => (
                  <div key={cell.id} style={{ marginBottom: 6 }}>
                    <Link href={`/workspaces/${workspaceId}/papers/${p.id}`}>&ldquo;{cell.quote}&rdquo;</Link>
                    <div style={{ fontSize: 12, color: '#555' }}>{cell.comment}</div>
                  </div>
                ))}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
