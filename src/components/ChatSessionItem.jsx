import { MessageSquare, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import './ChatSessionItem.css';

export default function ChatSessionItem({
  conversation,
  isActive,
  isCollapsed,
  onSelect,
  onRename,
  onDelete,
}) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  const handleRename = () => {
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== conversation.title) {
      onRename(conversation.id, trimmed);
    }
    setIsRenaming(false);
  };

  const handleCancelRename = () => {
    setEditTitle(conversation.title);
    setIsRenaming(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleRename();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelRename();
    }
  };

  const startRename = (e) => {
    e.stopPropagation();
    setEditTitle(conversation.title);
    setIsRenaming(true);
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    onDelete(conversation.id, conversation.title);
  };

  const handleClick = () => {
    if (!isRenaming) {
      onSelect(conversation.id);
    }
  };

  const truncatedTitle = conversation.title.length > 28
    ? `${conversation.title.slice(0, 28)}...`
    : conversation.title;

  return (
    <div
      className={`session-item${isActive ? ' is-active' : ''}${isCollapsed ? ' is-collapsed' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={`Conversation: ${conversation.title}`}
      aria-current={isActive ? 'true' : undefined}
      title={isCollapsed ? conversation.title : undefined}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      <div className="session-item__icon">
        <MessageSquare size={16} aria-hidden="true" />
      </div>

      {!isCollapsed && (
        <>
          {isRenaming ? (
            <input
              ref={inputRef}
              className="session-item__rename-input"
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={handleRename}
              onKeyDown={handleKeyDown}
              onClick={(e) => e.stopPropagation()}
              aria-label="Rename conversation"
              maxLength={60}
            />
          ) : (
            <span className="session-item__title">{truncatedTitle}</span>
          )}

          <div className="session-item__actions">
            <button
              className="session-item__action-btn"
              type="button"
              aria-label="Rename conversation"
              onClick={startRename}
            >
              <Pencil size={13} aria-hidden="true" />
            </button>
            <button
              className="session-item__action-btn session-item__action-btn--danger"
              type="button"
              aria-label="Delete conversation"
              onClick={handleDelete}
            >
              <Trash2 size={13} aria-hidden="true" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
