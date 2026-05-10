import { useState } from 'react';
import { ChevronDown, Clipboard, RotateCcw, Sparkles, Trash2, X } from 'lucide-react';
import FileIcon, { getFileTypeLabel } from './FileIcon.jsx';

const ACTIVE_STATUSES = new Set(['parsing', 'chunking', 'embedding', 'indexing']);

function formatSize(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value) {
  if (!value) return '-';

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return '-';

  const diffMs = Date.now() - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) return 'Just now';
  if (diffMs < hour) return `${Math.floor(diffMs / minute)} min ago`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)} hr ago`;
  if (diffMs < 7 * day) return `${Math.floor(diffMs / day)} days ago`;

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(new Date(timestamp));
}

function getProgressPercent(progress) {
  const total = progress?.totalChunks ?? 0;
  const processed = progress?.processedChunks ?? 0;

  if (total <= 0) return 0;
  return Math.min(100, Math.round((processed / total) * 100));
}

function StatusCell({ document, displayStatus, progress }) {
  const isActive = ACTIVE_STATUSES.has(displayStatus);
  const percent = getProgressPercent(progress);
  const processed = progress?.processedChunks ?? 0;
  const total = progress?.totalChunks ?? document.chunkCount ?? 0;

  if (isActive) {
    return (
      <div className="file-progress-cell">
        <div className="file-progress-meta">
          <span className="file-stage-label">{displayStatus}</span>
          {total > 0 && <span>{processed}/{total}</span>}
        </div>
        <div
          className={`file-progress-bar${total > 0 ? '' : ' is-indeterminate'}`}
          aria-label={`${displayStatus} progress`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={total > 0 ? percent : undefined}
          role="progressbar"
        >
          <span style={{ width: total > 0 ? `${percent}%` : undefined }} />
        </div>
      </div>
    );
  }

  return (
    <span className={`file-status-badge is-${displayStatus}`}>
      {displayStatus}
    </span>
  );
}

export default function FileRow({
  document,
  displayStatus,
  progress,
  isSelected,
  onSelect,
  onEmbed,
  onRemove,
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const canEmbed = displayStatus === 'pending' || displayStatus === 'failed';
  const isFailed = displayStatus === 'failed';
  const typeLabel = getFileTypeLabel(document.filename, document.mimeType);
  const errorMessage = document.error || progress?.error || 'Embedding failed without a detailed error.';

  const copyError = async () => {
    try {
      await navigator.clipboard?.writeText(errorMessage);
    } catch {
      // Clipboard permissions are browser-controlled; the visible error remains available.
    }
  };

  return (
    <div className={`file-table-row is-${displayStatus}${isSelected ? ' is-selected' : ''}`}>
      <div className="file-table-cell file-table-checkbox">
        <input
          type="checkbox"
          checked={isSelected}
          aria-label={`Select ${document.filename}`}
          onChange={(event) => onSelect(document.id, event.target.checked)}
        />
      </div>

      <div className="file-table-cell file-table-name" title={document.filename}>
        <FileIcon filename={document.filename} mimeType={document.mimeType} />
        <span>{document.filename}</span>
      </div>

      <div className="file-table-cell" data-label="Type">
        <span className={`file-type-badge is-${typeLabel.toLowerCase()}`}>{typeLabel}</span>
      </div>

      <div className="file-table-cell" data-label="Size">{formatSize(document.sizeBytes)}</div>

      <div className="file-table-cell file-table-status" data-label="Status">
        <StatusCell document={document} displayStatus={displayStatus} progress={progress} />
      </div>

      <div className="file-table-cell" data-label="Chunks">
        {document.chunkCount > 0 ? `${document.chunkCount}` : '-'}
      </div>

      <div className="file-table-cell" data-label="Date">{formatDate(document.updatedAt || document.createdAt)}</div>

      <div className="file-table-cell file-table-actions">
        {canEmbed && (
          <button
            className="file-action-button is-primary"
            type="button"
            aria-label={isFailed ? `Retry ${document.filename}` : `Embed ${document.filename}`}
            onClick={() => onEmbed(document)}
          >
            {isFailed ? <RotateCcw size={14} /> : <Sparkles size={14} />}
            <span>{isFailed ? 'Retry' : 'Embed'}</span>
          </button>
        )}

        {isFailed && (
          <button
            className={`file-action-icon${isExpanded ? ' is-active' : ''}`}
            type="button"
            aria-label={`${isExpanded ? 'Hide' : 'Show'} error for ${document.filename}`}
            aria-expanded={isExpanded}
            onClick={() => setIsExpanded((current) => !current)}
          >
            <ChevronDown size={15} />
          </button>
        )}

        <button
          className="file-action-icon is-danger"
          type="button"
          aria-label={`Remove ${document.filename}`}
          onClick={() => onRemove(document)}
        >
          <Trash2 size={15} />
        </button>
      </div>

      {isFailed && isExpanded && (
        <div className="file-error-row">
          <div className="file-error-message">
            <strong>Error</strong>
            <span>{errorMessage}</span>
          </div>
          <button className="file-error-copy" type="button" onClick={copyError}>
            <Clipboard size={14} />
            <span>Copy</span>
          </button>
          <button className="file-error-close" type="button" aria-label="Hide error" onClick={() => setIsExpanded(false)}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
