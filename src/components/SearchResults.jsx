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
        <FileText size={40} strokeWidth={1.5} />
        <p>No matching results found.</p>
        <span className="results-empty-hint">Try rephrasing your query or check your data sources.</span>
      </div>
    );
  }

  return (
    <div className="search-results">
      {/* Left: Result List */}
      <div className="result-list">
        <header className="result-list-header">
          <div className="result-list-title">
            {results.length} result{results.length !== 1 ? 's' : ''}
          </div>
          <div className="result-list-query" title={query}>
            &ldquo;{query}&rdquo;
          </div>
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
                <div className="result-item-rank">{index + 1}</div>

                <div className="result-item-body">
                  <div className="result-item-top">
                    <span className="result-item-title">
                      {result.documentName || 'Untitled document'}
                    </span>
                    <span className="result-item-score">
                      {formatScore(score)}
                    </span>
                  </div>

                  <div className="result-item-preview">
                    {result.content
                      ? result.content.slice(0, 220) +
                        (result.content.length > 220 ? '...' : '')
                      : 'No preview available'}
                  </div>

                  <div className="result-item-score-track">
                    <div
                      className="result-item-score-fill"
                      style={{ width: `${Math.round(score * 100)}%` }}
                    />
                  </div>

                  <span className="result-item-meta">
                    Chunk {result.chunkIndex != null ? result.chunkIndex + 1 : '—'}
                  </span>
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
        <FileText size={48} strokeWidth={1.2} />
        <p>Select a result to preview</p>
      </div>
    );
  }

  return (
    <div className="result-preview-content">
      <div className="result-preview-head">
        <div className="result-preview-doc">
          <FileText size={20} />
          <strong>{result.documentName || 'Untitled document'}</strong>
        </div>
        <div className="result-preview-badge">
          <span>Similarity</span>
          <b>{formatScore(result.score)}</b>
        </div>
      </div>

      <div className="result-preview-body">
        <p className="result-preview-text">{result.content || 'No content available.'}</p>
      </div>

      <div className="result-preview-foot">
        <div className="result-preview-tags">
          <span>Chunk {result.chunkIndex != null ? result.chunkIndex + 1 : '—'}</span>
          <span className="tag-sep">·</span>
          <span>{result.content ? `${result.content.length} chars` : '0 chars'}</span>
        </div>
        <button
          className="result-preview-close-btn"
          type="button"
          onClick={onClose}
        >
          Close preview
        </button>
      </div>
    </div>
  );
}
