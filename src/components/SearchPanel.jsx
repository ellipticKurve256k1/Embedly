import { FileText, PanelRightClose, Search } from 'lucide-react';
import './SearchPanel.css';

function formatScore(score) {
  if (typeof score !== 'number') return '0%';
  return `${Math.round(score * 100)}%`;
}

export default function SearchPanel({ isOpen, chunks, status, onClose }) {
  return (
    <aside className={`search-panel${isOpen ? ' is-open' : ''}`} aria-label="Retrieved context">
      <header className="search-panel__header">
        <div>
          <span className="search-panel__eyebrow">
            <Search size={14} />
            Context
          </span>
          <h2>Retrieved chunks</h2>
        </div>
        <button
          className="search-panel__close"
          type="button"
          aria-label="Close context panel"
          onClick={onClose}
        >
          <PanelRightClose size={18} />
        </button>
      </header>

      {status && (
        <div className={`search-panel__status search-panel__status--${status.type}`}>
          {status.message}
        </div>
      )}

      <div className="search-panel__list">
        {chunks.map((chunk, index) => (
          <article className="search-panel__chunk" key={chunk.chunkId ?? index}>
            <div className="search-panel__chunk-top">
              <FileText size={16} />
              <strong>{chunk.documentName || 'Untitled document'}</strong>
              <span>{formatScore(chunk.score)}</span>
            </div>
            <p>
              {chunk.content
                ? `${chunk.content.slice(0, 260)}${chunk.content.length > 260 ? '...' : ''}`
                : 'No preview available.'}
            </p>
            <small>Chunk {chunk.chunkIndex != null ? chunk.chunkIndex + 1 : 'unknown'}</small>
          </article>
        ))}
      </div>
    </aside>
  );
}
