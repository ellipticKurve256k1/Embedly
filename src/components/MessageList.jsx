import { useEffect, useMemo, useRef } from 'react';
import { Bot, LoaderCircle, UserRound } from 'lucide-react';
import SourceChip from './SourceChip.jsx';
import SourceList from './SourceList.jsx';
import './MessageList.css';

function formatTime(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function extractInlineCitedIndices(content) {
  const matches = String(content ?? '').matchAll(/\[Source (\d+)\]/g);
  return Array.from(new Set(
    Array.from(matches, (match) => Number.parseInt(match[1], 10) - 1)
      .filter((index) => Number.isInteger(index) && index >= 0),
  ));
}

function MessageContent({ content, sourceChunks, citedIndices = [] }) {
  const mergedCitedIndices = useMemo(() => (
    Array.from(new Set([
      ...citedIndices,
      ...extractInlineCitedIndices(content),
    ]))
  ), [content, citedIndices]);

  if (!sourceChunks || sourceChunks.length === 0) {
    return <p>{content}</p>;
  }

  const parts = content.split(/(\[Source \d+\])/g);

  const elements = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const match = part.match(/^\[Source (\d+)\]$/);

    if (match) {
      const sourceNum = parseInt(match[1], 10);
      elements.push(
        <SourceChip
          key={`citation-${i}`}
          number={sourceNum}
          chunk={sourceChunks[sourceNum - 1]}
          score={sourceChunks[sourceNum - 1]?.score}
          isCited={mergedCitedIndices.includes(sourceNum - 1)}
        />
      );
    } else if (part) {
      elements.push(<span key={`text-${i}`}>{part}</span>);
    }
  }

  return (
    <div className="message-content">
      <p>{elements.length > 0 ? elements : content}</p>
      <SourceList chunks={sourceChunks} citedIndices={mergedCitedIndices} />
    </div>
  );
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
                      citedIndices={message.citedIndices}
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
