import { LoaderCircle, RotateCcw, Sparkles } from 'lucide-react';

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
  const summary = `${counts.pending} queued, ${counts.failed} failed, ${counts.completed} completed${
    counts.embedding > 0 ? `, ${counts.embedding} embedding` : ''
  } in Knowledge Base`;

  return (
    <footer className="embed-action-bar" aria-live="polite">
      <div className="embed-action-summary">
        <strong>Knowledge Base</strong>
        <span>{views.length > 0 ? summary : 'Move files into the Knowledge Base before embedding.'}</span>
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
          <span>{isEmbedding ? 'Embedding' : 'Embed Pending & Retry Failed'}</span>
        </button>
      </div>
    </footer>
  );
}
