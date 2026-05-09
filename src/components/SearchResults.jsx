import { useEffect } from 'react';
import { FileText } from 'lucide-react';
import './SearchResults.css';

function formatScore(score) {
  if (typeof score !== 'number') return '0%';
  return `${Math.round(score * 100)}%`;
}

export default function SearchResults({
  query,
  results,
  selectedResult,
  onSelectResult,
  onClosePreview,
}) {
  // Auto-select first result when results arrive
  useEffect(() => {
    if (results && results.length > 0 && !selectedResult) {
      onSelectResult(results[0]);
    }
  }, [results, selectedResult, onSelectResult]);

  if (!results || results.length === 0) {
    return (
      <div className="search-results search-results--empty">
        <FileText size={32} strokeWidth={1.5} />
        <p>No matching results found.</p>
      </div>
    );
  }

  return (
    <div className="search-results">
      {/* Left: Result List */}
      <div className="result-list">
        <header className="result-list-header">
          <span className="result-list-count">
            {results.length} result{results.length !== 1 ? 's' : ''}
          </span>
          <span className="result-list-query">
            for &ldquo;{query.slice(0, 40)}{query.length > 40 ? '...' : ''}&rdquo;
          </span>
        </header>

        <div className="result-list-items">
          {results.map((result, index) => {
            const isSelected = selectedResult?.chunkId === result.chunkId;
            const score = result.score ?? 0;

            return (
              <button
                key={result.chunkId ?? index}
                className={`result-list-item${isSelected ? ' is-selected' : ''}`}
                onClick={() => onSelectResult(result)}
                type="button"
              >
                <div className="result-item-main">
                  <div className="result-item-rank">
                    <span>{index + 1}</span>
                  </div>
                  <div className="result-item-info">
                    <div className="result-item-title">
                      {result.documentName || 'Unknown document'}
                    </div>
                    <div className="result-item-meta">
                      <span className="result-item-score">{formatScore(score)}</span>
                      <span className="result-item-chunk">
                        chunk {result.chunkIndex != null ? result.chunkIndex + 1 : '—'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="result-item-score-bar">
                  <div
                    className="result-item-score-fill"
                    style={{ width: `${Math.round(score * 100)}%` }}
                  />
                </div>

                <div className="result-item-preview">
                  {result.content
                    ? result.content.slice(0, 140) +
                      (result.content.length > 140 ? '...' : '')
                    : 'No preview available'}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: Preview */}
      <div className="result-preview">
        <ResultPreview result={selectedResult} onClose={onClosePreview} />
      </div>
    </div>
  );
}

function ResultPreview({ result, onClose }) {
  if (!result) {
    return (
      <div className="result-preview-empty">
        <FileText size={40} strokeWidth={1.2} />
        <p>Select a result to preview</p>
      </div>
    );
  }

  return (
    <div className="result-preview-content">
      <header className="result-preview-header">
        <div className="result-preview-title">
          <FileText size={16} />
          <strong>{result.documentName || 'Unknown document'}</strong>
        </div>
        <div className="result-preview-score">
          <span className="result-preview-score-label">Similarity</span>
          <span className="result-preview-score-value">{formatScore(result.score)}</span>
        </div>
      </header>

      <div className="result-preview-meta-bar">
        <span className="result-preview-meta">
          Chunk {result.chunkIndex != null ? result.chunkIndex + 1 : '—'}
        </span>
        <span className="result-preview-meta">
          {result.content ? `${result.content.length} chars` : '—'}
        </span>
      </div>

      <div className="result-preview-body">
        <p className="result-preview-text">{result.content || 'No content available.'}</p>
      </div>

      <footer className="result-preview-footer">
        <button
          className="result-preview-close-btn"
          type="button"
          onClick={onClose}
        >
          Close preview
        </button>
      </footer>
    </div>
  );
}
