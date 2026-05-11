import { forwardRef } from 'react';
import { ExternalLink, FileText, X } from 'lucide-react';
import './SourcePopover.css';

function formatScore(score) {
  if (typeof score !== 'number') return 'Match unknown';
  return `${Math.round(score * 100)}% match`;
}

function formatBytes(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return '';
  }

  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function openDocument(documentId) {
  if (!documentId) return;

  window.open(
    `http://localhost:3001/api/documents/${encodeURIComponent(documentId)}`,
    '_blank',
    'noopener,noreferrer',
  );
}

function ContextSnippet({ label, chunk, tone = 'muted' }) {
  if (!chunk?.content) {
    return (
      <span className={`source-popover__snippet source-popover__snippet--${tone}`}>
        <span className="source-popover__snippet-label">{label}</span>
        <span className="source-popover__snippet-text">No adjacent chunk</span>
      </span>
    );
  }

  return (
    <span className={`source-popover__snippet source-popover__snippet--${tone}`}>
      <span className="source-popover__snippet-label">{label}</span>
      <span className="source-popover__snippet-text">{chunk.content}</span>
    </span>
  );
}

const SourcePopover = forwardRef(function SourcePopover({
  id,
  number,
  chunk,
  score,
  isCited,
  isPinned = false,
  placement = 'bottom',
  style,
  onClose,
  onMouseEnter,
  onMouseLeave,
}, ref) {
  const documentName = chunk?.documentName || 'Untitled document';
  const chunkPosition = chunk?.chunkIndex != null ? chunk.chunkIndex + 1 : null;
  const totalChunks = chunk?.totalChunks;
  const size = formatBytes(chunk?.documentSize);
  const uploadedAt = formatDate(chunk?.uploadedAt);
  const metadata = [
    chunk?.documentType,
    size,
    uploadedAt,
    chunk?.embeddingModel,
  ].filter(Boolean);

  return (
    <div
      className={`source-popover source-popover--${placement}${isPinned ? ' is-pinned' : ''}`}
      id={id}
      role={isPinned ? 'dialog' : 'tooltip'}
      aria-label={`Source ${number} details`}
      ref={ref}
      style={style}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <span className="source-popover__header">
        <span className="source-popover__icon" aria-hidden="true">
          <FileText size={15} />
        </span>
        <span className="source-popover__title">
          <strong>{documentName}</strong>
          {metadata.length > 0 && <small>{metadata.join(' / ')}</small>}
        </span>
        <span className="source-popover__score">{formatScore(score)}</span>
        {isPinned && (
          <button
            className="source-popover__close"
            type="button"
            aria-label="Close source details"
            onClick={onClose}
          >
            <X size={14} />
          </button>
        )}
      </span>

      <span className="source-popover__badges">
        <span>Source {number}</span>
        {isCited && <span className="source-popover__cited">Cited</span>}
      </span>

      <span className="source-popover__context" aria-label="Source context">
        <ContextSnippet label="Previous" chunk={chunk?.previousChunk} />
        <ContextSnippet label="Current" chunk={chunk} tone="current" />
        <ContextSnippet label="Next" chunk={chunk?.nextChunk} />
      </span>

      <span className="source-popover__footer">
        <span>
          Chunk {chunkPosition ?? 'unknown'}
          {typeof totalChunks === 'number' && totalChunks > 0 ? ` of ${totalChunks}` : ''}
          {typeof chunk?.tokenCount === 'number' ? ` / ${chunk.tokenCount} tokens` : ''}
        </span>
        <button
          type="button"
          onClick={() => openDocument(chunk?.documentId)}
          disabled={!chunk?.documentId}
        >
          <ExternalLink size={13} />
          View document
        </button>
      </span>
    </div>
  );
});

export default SourcePopover;
