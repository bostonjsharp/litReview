'use client';
import { useState, useRef } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

// API shape from /api/chat → src/lib/llm/types.ts Citation
interface Citation {
  parentType: 'paper' | 'review' | 'annotation';
  parentId: string;
  title: string;
  page: number | null;
}

interface Turn {
  key: number;
  q: string;
  answer: string;
  citations: Citation[];
}

type ScopeKind = 'workspace' | 'collection' | 'paper';

interface Scope {
  kind: ScopeKind;
  collectionId?: string;
  parentId?: string;
}

const SUGGESTED_Q = [
  'What are the key findings across this workspace?',
  'Where do papers agree or disagree on the main topic?',
  'What methodologies are used across these studies?',
];

// Render answer text, replacing [n] markers with superscript pills linked to citations
function AnswerText({
  text,
  citations,
  workspaceId,
}: {
  text: string;
  citations: Citation[];
  workspaceId: string;
}) {
  // Split on [n] markers, e.g. "text[1] more[2]" → ["text", "1", " more", "2", ""]
  const parts = text.split(/\[(\d+)\]/g);
  if (parts.length === 1) {
    // No markers — render as plain text
    return <div className="answer">{text}</div>;
  }
  return (
    <div className="answer">
      {parts.map((part, i) => {
        if (i % 2 === 0) {
          // Plain text segment
          return part ? <span key={i}>{part}</span> : null;
        }
        // Citation marker
        const n = parseInt(part, 10);
        const cite = citations[n - 1];
        if (!cite) return <sup key={i}>[{part}]</sup>;
        const href =
          cite.parentType === 'paper'
            ? `/workspaces/${workspaceId}/papers/${cite.parentId}`
            : undefined;
        if (href) {
          return (
            <Link key={i} href={href}>
              <sup>{n}</sup>
            </Link>
          );
        }
        return <sup key={i}>{n}</sup>;
      })}
    </div>
  );
}

export function ChatPanel({
  workspaceId,
  collections,
  paperCount,
}: {
  workspaceId: string;
  collections: { id: string; name: string }[];
  paperCount: number;
}) {
  const [scope, setScope] = useState<Scope>({ kind: 'workspace' });
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const turnKeyRef = useRef(0);

  function buildApiScope() {
    if (scope.kind === 'collection' && scope.collectionId) {
      return { collectionId: scope.collectionId };
    }
    if (scope.kind === 'paper' && scope.parentId) {
      return { parentType: 'paper' as const, parentId: scope.parentId };
    }
    return {};
  }

  async function send(question?: string) {
    const q = (question ?? input).trim();
    if (!q || sending) return;
    setSending(true);
    setError('');
    setInput('');

    // Optimistically append the question turn
    const turnKey = ++turnKeyRef.current;
    setTurns((prev) => [...prev, { key: turnKey, q, answer: '', citations: [] }]);
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: 1e9, behavior: 'smooth' });
    }, 40);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workspaceId, query: q, scope: buildApiScope() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `Error ${res.status}`);
        // Remove the optimistic turn
        setTurns((prev) => prev.filter((t) => t.key !== turnKey));
        return;
      }
      const data: { answer: string; citations: Citation[] } = await res.json();
      // Replace the optimistic turn with the real answer
      setTurns((prev) =>
        prev.map((t) =>
          t.key === turnKey ? { key: turnKey, q, answer: data.answer, citations: data.citations ?? [] } : t
        )
      );
      setTimeout(() => {
        scrollRef.current?.scrollTo({ top: 1e9, behavior: 'smooth' });
      }, 60);
    } catch {
      setError('Network error. Please try again.');
      setTurns((prev) => prev.filter((t) => t.key !== turnKey));
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const hasConvo = turns.length > 0;

  return (
    <div className="chat">
      {/* Scope pills */}
      <div className="chat-scope">
        <span className="meta" style={{ marginRight: 4 }}>
          Scope
        </span>
        <button
          className={'scope-pill' + (scope.kind === 'workspace' ? ' on' : '')}
          onClick={() => setScope({ kind: 'workspace' })}
        >
          <Icon name="layers" size={14} /> Whole workspace
        </button>
        {collections.map((c) => (
          <button
            key={c.id}
            className={'scope-pill' + (scope.kind === 'collection' && scope.collectionId === c.id ? ' on' : '')}
            onClick={() => setScope({ kind: 'collection', collectionId: c.id })}
          >
            <Icon name="grid" size={14} /> {c.name}
          </button>
        ))}
      </div>

      {/* Main area — empty state or conversation */}
      {!hasConvo ? (
        <div className="chat-empty">
          <div className="ce-mark">
            <Icon name="chat" size={28} />
          </div>
          <h2>Ask your corpus</h2>
          <p className="muted">
            Answers are drawn only from this workspace&apos;s papers, reviews and notes — each
            claim links back to its source.
          </p>
          <div className="chat-suggest">
            {SUGGESTED_Q.map((q) => (
              <button key={q} onClick={() => send(q)}>
                {q}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="chat-scroll" ref={scrollRef}>
          {turns.map((turn) => (
            <div key={turn.key}>
              <div className="msg-q">{turn.q}</div>
              {turn.answer ? (
                <div className="msg-a">
                  <div className="ai-mark">
                    <Icon name="sparkle" size={17} />
                  </div>
                  <div className="msg-a-body">
                    <AnswerText
                      text={turn.answer}
                      citations={turn.citations}
                      workspaceId={workspaceId}
                    />
                    {turn.citations.length > 0 && (
                      <div className="cites">
                        <div className="cites-head">{turn.citations.length} sources</div>
                        {turn.citations.map((c, j) => {
                          const href =
                            c.parentType === 'paper'
                              ? `/workspaces/${workspaceId}/papers/${c.parentId}`
                              : undefined;
                          const inner = (
                            <>
                              <span className="cite-num">{j + 1}</span>
                              <div className="cite-body">
                                <div className="cite-src">
                                  <span className="cite-type">{c.parentType}</span>
                                  {c.title}
                                  {c.page != null ? ` · p.${c.page}` : ''}
                                </div>
                                {/* No quote text in API response — omit .cite-q */}
                              </div>
                              <Icon
                                name="arrowRight"
                                size={15}
                                style={{ color: 'var(--faint)', alignSelf: 'center' }}
                              />
                            </>
                          );
                          if (href) {
                            return (
                              <Link key={j} href={href} className="cite">
                                {inner}
                              </Link>
                            );
                          }
                          return (
                            <div key={j} className="cite">
                              {inner}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                // Still loading this turn
                <div className="msg-a">
                  <div className="ai-mark">
                    <Icon name="sparkle" size={17} />
                  </div>
                  <div className="msg-a-body">
                    <div className="answer" style={{ color: 'var(--muted)' }}>
                      Thinking…
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="chat-input-wrap">
        <div className="chat-input">
          <textarea
            rows={1}
            placeholder="Ask about your papers…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={sending}
          />
          <button
            className="btn btn-primary btn-icon"
            style={{ width: 40, height: 40, flexShrink: 0 }}
            onClick={() => send()}
            disabled={sending || !input.trim()}
          >
            <Icon name="arrowRight" size={18} />
          </button>
        </div>
        <div className="chat-hint">
          Answers cite only your workspace · {paperCount} paper{paperCount !== 1 ? 's' : ''} in
          scope
        </div>
        {error && (
          <p style={{ color: 'var(--danger, red)', fontSize: 13, textAlign: 'center', marginTop: 6 }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
