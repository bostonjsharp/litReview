import Link from 'next/link';
import { db, schema } from '@/db/client';
import { getLLM } from '@/lib/llm';
import { retrieve } from '@/lib/search/retrieve';
import { passageHref } from '@/lib/ui/passage-link';
import { Icon } from '@/components/ui/Icon';

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { id } = await params;
  const { q } = await searchParams;
  const query = (q ?? '').trim();
  const results = query
    ? await retrieve(query, getLLM(), db, { scope: { workspaceId: id }, schema })
    : [];

  return (
    <>
      <div className="list-head">
        <h2>
          Search{query ? <> · <span className="count">{results.length}</span></> : null}
        </h2>
      </div>

      {!query && (
        <p className="meta">Type in the search bar above to find passages across this workspace.</p>
      )}
      {query && results.length === 0 && (
        <p className="meta">No matching passages for &ldquo;{query}&rdquo;.</p>
      )}

      {results.length > 0 && (
        <div className="card list-card">
          {results.map((r) => {
            const href = passageHref(id, {
              parentType: r.source.parentType,
              parentId: r.source.parentId,
              paperId: r.source.paperId,
              charStart: r.source.charStart,
            });
            const snippet = r.text.length > 240 ? r.text.slice(0, 240) + '…' : r.text;
            const inner = (
              <>
                <div className="paper-main">
                  <div className="paper-title" style={{ fontWeight: 400 }}>{snippet}</div>
                  <div className="paper-meta">
                    <span className="meta">
                      {r.source.title}
                      {r.source.page != null ? ` · p.${r.source.page}` : ''}
                    </span>
                  </div>
                </div>
                {href && <Icon name="arrowRight" size={15} style={{ color: 'var(--faint)' }} />}
              </>
            );
            return href ? (
              <Link key={r.id} href={href} className="paper-row click">{inner}</Link>
            ) : (
              <div key={r.id} className="paper-row">{inner}</div>
            );
          })}
        </div>
      )}
    </>
  );
}
