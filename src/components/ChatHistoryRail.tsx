'use client';
import { Icon } from '@/components/ui/Icon';

export interface ChatSummary {
  id: string;
  title: string;
}

export function ChatHistoryRail({
  chats,
  activeId,
  onSelect,
  onNew,
  onDelete,
}: {
  chats: ChatSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <aside className="chat-rail">
      <div className="chat-rail-head">
        <button className="btn btn-primary btn-sm" style={{ width: '100%' }} onClick={onNew}>
          <Icon name="plus" size={14} /> New chat
        </button>
      </div>
      <div className="chat-rail-list">
        {chats.length === 0 && (
          <p className="meta" style={{ padding: '8px 10px' }}>No chats yet.</p>
        )}
        {chats.map((c) => (
          <div
            key={c.id}
            className={'chat-rail-item' + (c.id === activeId ? ' on' : '')}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(c.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(c.id);
              }
            }}
          >
            <Icon name="chat" size={14} />
            <span className="ri-title">{c.title}</span>
            <button
              className="chat-rail-del"
              aria-label="Delete chat"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(c.id);
              }}
            >
              <Icon name="x" size={13} />
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}
