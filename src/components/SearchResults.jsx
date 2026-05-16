import { useEffect } from 'react';
import { FileText, Award, CircleDot, Hash } from 'lucide-react';
import './SearchResults.css';

function formatScore(score) {
  if (typeof score !== 'number') return '0%';
  return `${Math.round(score * 100)}%`;
}

function formatDecimalScore(score) {
  if (typeof score !== 'number') return '0.000';
  return score.toFixed(3);
}

export default function SearchResults({
  query,
  results,
  selectedResult,
  onSelectResult,
  onClosePreview,
}) {
  // Auto-select first result when a new search returns
  useEffect(() => {
    if (results && results.length > 0) {
      onSelectResult(results[0]);
    }
  }, [results]); // only when results reference changes (new search)

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
            const score = result.rerankScore ?? result.score ?? 0;
            const rank = index + 1;
            const rankClass = rank <= 3 ? ` rank-${rank}` : '';

            return (
              <button
                key={result.chunkId ?? index}
                className={`result-list-item${isSelected ? ' is-selected' : ''}${rankClass}`}
                onClick={() => onSelectResult(result)}
                type="button"
              >
                <div className="result-item-rank">
                    {rank === 1 ? (
                      <Award size={16} />
                    ) : rank === 2 ? (
                      <CircleDot size={16} />
                    ) : rank === 3 ? (
                      <Hash size={16} />
                    ) : (
                      rank
                    )}
                  </div>

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

                  <div className="result-item-meta-row">
                    <span className="result-item-meta">
                      Chunk {result.chunkIndex != null ? result.chunkIndex + 1 : '—'}
                    </span>
                    {typeof result.rerankScore === 'number' && (
                      <span className="result-item-rerank-meta">
                        Embedding {formatDecimalScore(result.score)} · Rerank {formatDecimalScore(result.rerankScore)}
                      </span>
                    )}
                  </div>
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

  const displayScore = result.rerankScore ?? result.score;

  return (
    <div className="result-preview-content">
      <div className="result-preview-head">
        <div className="result-preview-doc">
          <FileText size={20} />
          <strong>{result.documentName || 'Untitled document'}</strong>
        </div>
        <div className="result-preview-badge">
          <span>{typeof result.rerankScore === 'number' ? 'Rerank' : 'Similarity'}</span>
          <b>{formatScore(displayScore)}</b>
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
          {typeof result.rerankScore === 'number' && (
            <>
              <span className="tag-sep">·</span>
              <span>Embedding {formatDecimalScore(result.score)}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
