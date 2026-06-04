'use client';
import { useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { ChatHistoryRail, type ChatSummary } from '@/components/ChatHistoryRail';

interface Citation {
  parentType: 'paper' | 'review' | 'annotation';
  parentId: string;
  title: string;
  page: number | null;
}
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: Citation[];
  pending?: boolean;
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

function AnswerText({
  text,
  citations,
  workspaceId,
}: {
  text: string;
  citations: Citation[];
  workspaceId: string;
}) {
  const parts = text.split(/\[(\d+)\]/g);
  if (parts.length === 1) return <div className="answer">{text}</div>;
  return (
    <div className="answer">
      {parts.map((part, i) => {
        if (i % 2 === 0) return part ? <span key={i}>{part}</span> : null;
        const n = parseInt(part, 10);
        const cite = citations[n - 1];
        if (!cite) return <sup key={i}>[{part}]</sup>;
        const href =
          cite.parentType === 'paper' ? `/workspaces/${workspaceId}/papers/${cite.parentId}` : undefined;
        return href ? (
          <Link key={i} href={href}>
            <sup>{n}</sup>
          </Link>
        ) : (
          <sup key={i}>{n}</sup>
        );
      })}
    </div>
  );
}

export function ChatPanel({
  workspaceId,
  collections,
  paperCount,
  initialChats,
}: {
  workspaceId: string;
  collections: { id: string; name: string }[];
  paperCount: number;
  initialChats: ChatSummary[];
}) {
  const [chats, setChats] = useState<ChatSummary[]>(initialChats);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [scope, setScope] = useState<Scope>({ kind: 'workspace' });
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [railOpen, setRailOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const tmpKeyRef = useRef(0);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => scrollRef.current?.scrollTo({ top: 1e9, behavior: 'smooth' }), 40);
  }, []);

  async function selectChat(id: string) {
    setError('');
    setRailOpen(false);
    const res = await fetch(`/api/chats/${id}`);
    if (!res.ok) {
      setError('Could not load chat.');
      return;
    }
    const data = await res.json();
    setActiveChatId(id);
    setMessages(
      data.messages.map((m: { id: string; role: 'user' | 'assistant'; content: string; citations: Citation[] | null }) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        citations: m.citations ?? [],
      })),
    );
    const c = data.chat;
    setScope(
      c.scopeKind === 'collection'
        ? { kind: 'collection', collectionId: c.scopeId }
        : c.scopeKind === 'paper'
          ? { kind: 'paper', parentId: c.scopeId }
          : { kind: 'workspace' },
    );
    scrollToBottom();
  }

  function newChat() {
    setActiveChatId(null);
    setMessages([]);
    setError('');
    setRailOpen(false);
  }

  async function deleteChat(id: string) {
    const wasActive = activeChatId === id;
    const res = await fetch(`/api/chats/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      setError('Could not delete chat.');
      return;
    }
    setChats((prev) => prev.filter((c) => c.id !== id));
    if (wasActive) newChat();
  }

  function scopeForCreate() {
    return {
      scopeKind: scope.kind,
      scopeId:
        scope.kind === 'collection' ? scope.collectionId : scope.kind === 'paper' ? scope.parentId : undefined,
    };
  }

  async function send(question?: string) {
    const q = (question ?? input).trim();
    if (!q || sending) return;
    setSending(true);
    setError('');
    setInput('');

    let chatId = activeChatId;
    if (!chatId) {
      const cr = await fetch('/api/chats', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workspaceId, ...scopeForCreate() }),
      });
      if (!cr.ok) {
        setError('Could not start chat.');
        setSending(false);
        return;
      }
      chatId = (await cr.json()).id as string;
      setActiveChatId(chatId);
      setChats((prev) => [{ id: chatId as string, title: q.length > 60 ? q.slice(0, 60) + '…' : q }, ...prev]);
    }

    const tmp = `tmp-${++tmpKeyRef.current}`;
    setMessages((prev) => [
      ...prev,
      { id: tmp + '-q', role: 'user', content: q, citations: [] },
      { id: tmp + '-a', role: 'assistant', content: '', citations: [], pending: true },
    ]);
    scrollToBottom();

    try {
      const res = await fetch(`/api/chats/${chatId}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: q }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `Error ${res.status}`);
        setMessages((prev) => prev.filter((m) => m.id !== tmp + '-a'));
        return;
      }
      const data = await res.json();
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tmp + '-a'
            ? { id: data.message.id, role: 'assistant', content: data.message.content, citations: data.message.citations ?? [] }
            : m,
        ),
      );
      setChats((prev) => {
        const me = prev.find((c) => c.id === chatId);
        return me ? [me, ...prev.filter((c) => c.id !== chatId)] : prev;
      });
      scrollToBottom();
    } catch {
      setError('Network error. Please try again.');
      setMessages((prev) => prev.filter((m) => m.id !== tmp + '-a'));
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

  return (
    <div className="chat-layout">
      <div className={'chat-rail' + (railOpen ? '' : ' collapsed-mobile')}>
        <ChatHistoryRail
          chats={chats}
          activeId={activeChatId}
          onSelect={selectChat}
          onNew={newChat}
          onDelete={deleteChat}
        />
      </div>

      <div className="chat">
        <div className="chat-scope">
          <button
            className="btn btn-quiet btn-sm chat-history-toggle"
            onClick={() => setRailOpen((o) => !o)}
            aria-label="Toggle history"
          >
            <Icon name="chat" size={14} /> History
          </button>
          <span className="meta" style={{ marginRight: 4 }}>Scope</span>
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

        {messages.length === 0 ? (
          <div className="chat-empty">
            <div className="ce-mark">
              <Icon name="chat" size={28} />
            </div>
            <h2>Ask your corpus</h2>
            <p className="muted">
              Answers are drawn only from this workspace&apos;s papers, reviews and notes — each claim links
              back to its source.
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
            {messages.map((m) =>
              m.role === 'user' ? (
                <div className="msg-q" key={m.id}>
                  {m.content}
                </div>
              ) : (
                <div className="msg-a" key={m.id}>
                  <div className="ai-mark">
                    <Icon name="sparkle" size={17} />
                  </div>
                  <div className="msg-a-body">
                    {m.pending ? (
                      <div className="answer" style={{ color: 'var(--muted)' }}>
                        Thinking…
                      </div>
                    ) : (
                      <>
                        <AnswerText text={m.content} citations={m.citations} workspaceId={workspaceId} />
                        {m.citations.length > 0 && (
                          <div className="cites">
                            <div className="cites-head">{m.citations.length} sources</div>
                            {m.citations.map((c, j) => {
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
                                  </div>
                                  <Icon
                                    name="arrowRight"
                                    size={15}
                                    style={{ color: 'var(--faint)', alignSelf: 'center' }}
                                  />
                                </>
                              );
                              return href ? (
                                <Link key={j} href={href} className="cite">
                                  {inner}
                                </Link>
                              ) : (
                                <div key={j} className="cite">
                                  {inner}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ),
            )}
          </div>
        )}

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
            Answers cite only your workspace · {paperCount} paper{paperCount !== 1 ? 's' : ''} in scope
          </div>
          {error && (
            <p style={{ color: 'var(--danger, red)', fontSize: 13, textAlign: 'center', marginTop: 6 }}>{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
