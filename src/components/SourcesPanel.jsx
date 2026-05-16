import { FileText, PanelRightClose, PanelRightOpen, Search } from 'lucide-react';
import ProjectChip from './ProjectChip.jsx';
import './SourcesPanel.css';

function formatScore(score) {
  if (typeof score !== 'number') return '0%';
  return `${Math.round(score * 100)}%`;
}

function formatDecimalScore(score) {
  if (typeof score !== 'number') return '0.000';
  return score.toFixed(3);
}

export default function SourcesPanel({
  isOpen,
  chunks,
  citedIndices = [],
  retrievalQuery,
  originalQuery,
  wasRewritten,
  project,
  projectName,
  status,
  onClose,
}) {
  const citedSet = new Set(citedIndices);

  return (
    <aside className={`sources-panel${isOpen ? ' is-open' : ''}`} aria-label="Retrieved context">
      {isOpen ? (
        <>
          <header className="sources-panel__header">
            <div>
              <span className="sources-panel__eyebrow">
                <Search size={14} />
                Context
              </span>
              <h2>Retrieved chunks</h2>
            </div>
            <button
              className="sources-panel__toggle"
              type="button"
              aria-label="Close context panel"
              onClick={onClose}
            >
              <PanelRightClose size={18} />
            </button>
          </header>

          {status && (
            <div className={`sources-panel__status sources-panel__status--${status.type}`}>
              {status.message}
            </div>
          )}

          <div className="sources-panel__scope">
            <span>Scope</span>
            <ProjectChip
              project={project ?? null}
              label={projectName ?? 'All Documents'}
              documentCount={project?.documentCount}
              variant="compact"
              showCount={Boolean(project)}
            />
          </div>

          {retrievalQuery && (
            <div className="sources-panel__query">
              <span>{wasRewritten ? 'Rewritten query' : 'Searched for'}</span>
              <p>{retrievalQuery}</p>
              {wasRewritten && originalQuery && (
                <small className="sources-panel__original">Original: "{originalQuery}"</small>
              )}
            </div>
          )}

          <div className="sources-panel__list">
            {chunks.length === 0 ? (
              <div className="sources-panel__empty">
                <p>No sources yet</p>
                <span>Sources will appear here when you ask a question</span>
              </div>
            ) : (
              chunks.map((chunk, index) => (
                <article
                  className={`sources-panel__chunk${citedSet.has(index) ? ' is-cited' : ''}`}
                  key={chunk.chunkId ?? index}
                >
                  <div className="sources-panel__chunk-top">
                    <FileText size={16} />
                    <strong>{chunk.documentName || 'Untitled document'}</strong>
                    <span>{formatScore(chunk.rerankScore ?? chunk.score)}</span>
                  </div>
                  {citedSet.has(index) && (
                    <small className="sources-panel__cited-label">Cited in answer</small>
                  )}
                  {typeof chunk.rerankScore === 'number' && (
                    <div className="sources-panel__scores" aria-label="Retrieval scores">
                      <span>Embedding {formatDecimalScore(chunk.score)}</span>
                      <span>Rerank {formatDecimalScore(chunk.rerankScore)}</span>
                    </div>
                  )}
                  <p>
                    {chunk.preview || chunk.content
                      ? (chunk.preview ?? `${chunk.content.slice(0, 260)}${chunk.content.length > 260 ? '...' : ''}`)
                      : 'No preview available.'}
                  </p>
                  <small>Chunk {chunk.chunkIndex != null ? chunk.chunkIndex + 1 : 'unknown'}</small>
                  {chunk.projectName && <small>{chunk.projectName}</small>}
                </article>
              ))
            )}
          </div>
        </>
      ) : (
        <button
          className="sources-panel__collapsed-bar"
          type="button"
          onClick={onClose}
          aria-label="Open context panel"
        >
          <span className="sources-panel__collapsed-label">SOURCES</span>
          {chunks.length > 0 && (
            <span className="sources-panel__collapsed-count">{chunks.length}</span>
          )}
          <PanelRightOpen size={20} />
        </button>
      )}
    </aside>
  );
}
