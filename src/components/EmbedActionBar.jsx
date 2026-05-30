import { LoaderCircle, RotateCcw, Sparkles } from 'lucide-react';
import './EmbedActionBar.css';

export default function EmbedActionBar({
  views,
  isEmbedding,
  onEmbed,
  onClearFailed,
}) {
  const counts = views.reduce((nextCounts, view) => {
    nextCounts[view.statusGroup] += 1;
    return nextCounts;
  }, {
    pending: 0,
    embedding: 0,
    completed: 0,
    failed: 0,
  });
  const actionableCount = counts.pending + counts.failed;
  const hasFailed = counts.failed > 0;

  return (
    <footer className="embed-action-bar">
      <div className="embed-action-summary">
        <strong>Knowledge Base</strong>
        {views.length > 0 ? (
          <div className="embed-metrics">
            {counts.pending > 0 && (
              <span className="embed-metric is-pending">{counts.pending} Queued</span>
            )}
            {counts.failed > 0 && (
              <span className="embed-metric is-failed">{counts.failed} Failed</span>
            )}
            {counts.completed > 0 && (
              <span className="embed-metric is-completed">{counts.completed} Completed</span>
            )}
            {counts.embedding > 0 && (
              <span className="embed-metric is-embedding">{counts.embedding} Embedding</span>
            )}
          </div>
        ) : (
          <span>Move files into the Knowledge Base before embedding.</span>
        )}
      </div>

      <div className="embed-action-buttons">
        <button
          className="embed-secondary-button"
          type="button"
          disabled={!hasFailed || isEmbedding}
          onClick={onClearFailed}
        >
          <RotateCcw size={15} />
          <span>Clear Failed</span>
        </button>

        <button
          className={`embed-primary-button${isEmbedding ? ' is-loading' : ''}`}
          type="button"
          disabled={actionableCount === 0 || isEmbedding}
          onClick={onEmbed}
        >
          {isEmbedding ? <LoaderCircle size={16} /> : <Sparkles size={16} />}
          <span>{isEmbedding ? 'Embedding' : 'Embed All'}</span>
        </button>
      </div>
      <span className="sr-only" aria-live="polite">
        {isEmbedding ? 'Embedding in progress' : `${actionableCount} files ready to embed`}
      </span>
    </footer>
  );
}
