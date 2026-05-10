import { Bot, LoaderCircle, UserRound } from 'lucide-react';
import './MessageList.css';

function formatTime(value) {
  if (!value) return '';

  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(value);
}

export default function MessageList({ messages, isSearching }) {
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
    <div className="message-list">
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
                    <p>{message.content}</p>
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
      </div>
    </div>
  );
}
