import {
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Trash2,
} from 'lucide-react';
import ChatSessionItem from './ChatSessionItem.jsx';
import './ChatSidebar.css';

export default function ChatSidebar({
  conversations,
  activeConversationId,
  isOpen,
  isStorageReady,
  onToggle,
  onNewConversation,
  onSelectConversation,
  onRenameConversation,
  onDeleteConversation,
}) {
  const deleteTarget = conversations.find((conversation) => conversation.id === activeConversationId);

  return (
    <aside className={`chat-sidebar${isOpen ? ' is-open' : ' is-collapsed'}`} aria-label="Conversations">
      <header className="chat-sidebar__header">
        {isOpen ? (
          <>
            <div>
              <span className="chat-sidebar__eyebrow">
                <MessageSquare size={14} aria-hidden="true" />
                History
              </span>
              <h2>Conversations</h2>
            </div>
            <button
              className="chat-sidebar__icon-btn"
              type="button"
              aria-label="Collapse conversations"
              onClick={onToggle}
            >
              <PanelLeftClose size={18} aria-hidden="true" />
            </button>
          </>
        ) : (
          <button
            className="chat-sidebar__icon-btn"
            type="button"
            aria-label="Expand conversations"
            onClick={onToggle}
          >
            <PanelLeftOpen size={18} aria-hidden="true" />
          </button>
        )}
      </header>

      <button
        className="chat-sidebar__new-btn"
        type="button"
        aria-label="Start new conversation"
        title="New chat"
        onClick={onNewConversation}
      >
        <Plus size={17} aria-hidden="true" />
        {isOpen && <span>New Chat</span>}
      </button>

      {!isStorageReady && isOpen && (
        <div className="chat-sidebar__storage-note" role="status">
          Chat history is temporary in this browser session.
        </div>
      )}

      <div className="chat-sidebar__list" role="list" aria-label="Saved conversations">
        {conversations.length === 0 ? (
          isOpen && (
            <div className="chat-sidebar__empty">
              <p>No conversations yet</p>
              <span>Ask a question to save the first chat.</span>
            </div>
          )
        ) : (
          conversations.map((conversation) => (
            <ChatSessionItem
              key={conversation.id}
              conversation={conversation}
              isActive={conversation.id === activeConversationId}
              isCollapsed={!isOpen}
              onSelect={onSelectConversation}
              onRename={onRenameConversation}
              onDelete={onDeleteConversation}
            />
          ))
        )}
      </div>

      <footer className="chat-sidebar__footer">
        {isOpen ? (
          <span>{conversations.length} / 30</span>
        ) : (
          deleteTarget && (
            <button
              className="chat-sidebar__icon-btn chat-sidebar__icon-btn--danger"
              type="button"
              aria-label="Delete active conversation"
              title="Delete active conversation"
              onClick={() => onDeleteConversation(deleteTarget.id, deleteTarget.title)}
            >
              <Trash2 size={16} aria-hidden="true" />
            </button>
          )
        )}
      </footer>
    </aside>
  );
}
