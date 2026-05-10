import { useEffect, useRef, useState } from 'react';
import { Bot, FileText, LoaderCircle, UserRound } from 'lucide-react';
import './MessageList.css';

function formatTime(value) {
  if (!value) return '';

  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(value);
}

function Citation({ number, chunk }) {
  const [expanded, setExpanded] = useState(false);

  if (!chunk) {
    return <span className="citation__fallback">[Source {number}]</span>;
  }

  return (
    <span className="citation">
      <button
        className={`citation__trigger${expanded ? ' is-expanded' : ''}`}
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        [Source {number}]
        <span className="citation__arrow" aria-hidden="true">{expanded ? '↑' : '↓'}</span>
      </button>
      {expanded && (
        <span className="citation__popup">
          <span className="citation__header">
            <FileText size={14} />
            <strong>{chunk.documentName || 'Untitled document'}</strong>
            <span>Chunk {chunk.chunkIndex != null ? chunk.chunkIndex + 1 : '—'}</span>
            <span>{typeof chunk.score === 'number' ? `${Math.round(chunk.score * 100)}%` : ''}</span>
          </span>
          <span className="citation__content">{chunk.content || 'No content available.'}</span>
        </span>
      )}
    </span>
  );
}

function MessageContent({ content, sourceChunks }) {
  if (!sourceChunks || sourceChunks.length === 0) {
    return <p>{content}</p>;
  }

  // Split content by [Source N] pattern
  const parts = content.split(/(\[Source \d+\])/g);

  if (parts.length <= 1) {
    return <p>{content}</p>;
  }

  const elements = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const match = part.match(/^\[Source (\d+)\]$/);

    if (match) {
      const sourceNum = parseInt(match[1], 10);
      elements.push(
        <Citation
          key={`citation-${i}`}
          number={sourceNum}
          chunk={sourceChunks[sourceNum - 1]}
        />
      );
    } else if (part) {
      elements.push(<span key={`text-${i}`}>{part}</span>);
    }
  }

  return <p>{elements}</p>;
}

export default function MessageList({ messages, isSearching }) {
  const listRef = useRef(null);

  useEffect(() => {
    const frameId = requestAnimationFrame(() => {
      const listElement = listRef.current;
      if (listElement) {
        listElement.scrollTop = listElement.scrollHeight;
      }
    });

    return () => cancelAnimationFrame(frameId);
  }, [messages, isSearching]);

  if (messages.length === 0) {
    return (
      <div className="message-list message-list--empty">
        <div className="message-list__empty-orbit" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="message-list__empty-copy">
          <h1>Chat with your knowledge base</h1>
          <p>What do you want to understand?</p>
        </div>
      </div>
    );
  }

  return (
    <div className="message-list" ref={listRef}>
      <div className="message-list__items">
        {messages.map((message) => {
          const isAssistant = message.role === 'assistant';
          const Icon = isAssistant ? Bot : UserRound;

          return (
            <article
              key={message.id}
              className={[
                'message',
                isAssistant ? 'message--assistant' : 'message--user',
                message.isError ? 'message--error' : '',
              ].filter(Boolean).join(' ')}
            >
              <div className="message__avatar" aria-hidden="true">
                <Icon size={18} />
              </div>
              <div className="message__body">
                <div className="message__bubble">
                  {message.content ? (
                    <MessageContent
                      content={message.content}
                      sourceChunks={message.sourceChunks}
                    />
                  ) : (
                    <span className="message__pending">
                      <LoaderCircle size={16} />
                      Thinking
                    </span>
                  )}
                </div>
                <div className="message__meta">
                  <span>{isAssistant ? 'Embeddly' : 'You'}</span>
                  <span>{formatTime(message.createdAt)}</span>
                  {message.isStreaming && <span>Streaming</span>}
                </div>
              </div>
            </article>
          );
        })}

        {isSearching && (
          <div className="message-list__retrieval">
            <LoaderCircle size={16} />
            Retrieving context
          </div>
        )}
        <div className="message-list__bottom" aria-hidden="true" />
      </div>
    </div>
  );
}
