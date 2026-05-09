import { useCallback } from 'react';
import { X, File, Copy, Check } from 'lucide-react';
import './ResultPanel.css';

function formatScore(score) {
  if (typeof score !== 'number') return '0%';
  return `${Math.round(score * 100)}%`;
}

export default function ResultPanel({ result, onClose }) {
  const handleCopy = useCallback(async () => {
    if (!result?.content) return;

    try {
      await navigator.clipboard.writeText(result.content);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  }, [result?.content]);

  if (!result) {
    return null;
  }

  return (
    <aside className="result-panel">
      <header className="result-panel-header">
        <span className="result-panel-title">
          <File size={16} />
          <strong>{result.documentName || 'Unknown document'}</strong>
        </span>
        <button
          className="result-panel-close"
          type="button"
          aria-label="Close panel"
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </header>

      <div className="result-panel-meta">
        <div className="result-score">
          <span className="result-score-label">Similarity</span>
          <span className="result-score-value">{formatScore(result.score)}</span>
        </div>
        <div className="result-score-bar">
          <div
            className="result-score-fill"
            style={{ width: `${Math.round(result.score * 100)}%` }}
          />
        </div>
      </div>

      <div className="result-panel-content">
        <p className="result-chunk-text">{result.content || 'No content available.'}</p>
      </div>

      <footer className="result-panel-actions">
        <button
          className="result-action-button"
          type="button"
          onClick={handleCopy}
        >
          <Copy size={14} />
          <span>Copy chunk</span>
        </button>
      </footer>
    </aside>
  );
}
