import { LoaderCircle, Sparkles, X } from 'lucide-react';

function formatSize(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function EmbedActionBar({ documents, isEmbedding, onEmbed, onCancel }) {
  const totalBytes = documents.reduce((sum, document) => sum + (document.sizeBytes ?? 0), 0);
  const totalChunks = documents.reduce((sum, document) => sum + (document.chunkCount ?? 0), 0);
  const hasQueuedFiles = documents.length > 0;
  const summary = hasQueuedFiles
    ? `${documents.length} file${documents.length === 1 ? '' : 's'}, ${formatSize(totalBytes)} total${
      totalChunks > 0 ? `, ${totalChunks} existing chunks` : ''
    }`
    : 'Move files into the queue before embedding.';

  return (
    <footer className="embed-action-bar" aria-live="polite">
      <div className="embed-action-summary">
        <strong>Embedding queue</strong>
        <span>{summary}</span>
      </div>

      <div className="embed-action-buttons">
        <button
          className="embed-secondary-button"
          type="button"
          disabled={!hasQueuedFiles || isEmbedding}
          onClick={onCancel}
        >
          <X size={15} />
          <span>Cancel</span>
        </button>

        <button
          className="embed-primary-button"
          type="button"
          disabled={!hasQueuedFiles || isEmbedding}
          onClick={onEmbed}
        >
          {isEmbedding ? <LoaderCircle size={16} /> : <Sparkles size={16} />}
          <span>{isEmbedding ? 'Embedding' : 'Embed Selected Files'}</span>
        </button>
      </div>
    </footer>
  );
}
