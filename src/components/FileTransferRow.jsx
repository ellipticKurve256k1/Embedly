import { LoaderCircle, RotateCcw, Sparkles, Trash2 } from 'lucide-react';
import FileIcon from './FileIcon.jsx';

const ACTIVE_STATUSES = new Set(['parsing', 'chunking', 'embedding', 'indexing']);

function formatSize(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getProgressPercent(progress) {
  const total = progress?.totalChunks ?? 0;
  const processed = progress?.processedChunks ?? 0;

  if (total <= 0) return 0;
  return Math.min(100, Math.round((processed / total) * 100));
}

function getKnowledgeStatus(displayStatus) {
  return displayStatus === 'pending' ? 'queued' : displayStatus;
}

function StatusBadge({ status, error }) {
  return (
    <span className={`transfer-status-badge is-${status}`} title={error || status}>
      {status}
    </span>
  );
}

function ProgressStatus({ status, progress, chunkCount }) {
  const total = progress?.totalChunks ?? chunkCount ?? 0;
  const processed = progress?.processedChunks ?? 0;
  const percent = getProgressPercent(progress);

  return (
    <div className="transfer-progress">
      <div className="transfer-progress-meta">
        <span>{status}</span>
        {total > 0 && <span>{processed}/{total}</span>}
      </div>
      <div
        className={`transfer-progress-bar${total > 0 ? '' : ' is-indeterminate'}`}
        aria-label={`${status} progress`}
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

export function UploadingTransferRow({ file }) {
  return (
    <div className="transfer-row is-uploading">
      <div className="transfer-row-check" aria-hidden="true" />
      <div className="transfer-row-main" title={file.name}>
        <FileIcon filename={file.name} size={17} />
        <div className="transfer-row-title">
          <strong>{file.name}</strong>
          <span>{formatSize(file.size)}</span>
        </div>
      </div>
      <div className="transfer-row-meta">
        <span className="transfer-status-badge is-embedding">
          <LoaderCircle size={12} />
          Uploading
        </span>
      </div>
    </div>
  );
}

export default function FileTransferRow({
  view,
  variant,
  isSelected,
  onSelect,
  onRemove,
  onEmbed,
  isActionDisabled,
}) {
  const { document, displayStatus, progress, statusGroup } = view;
  const isActive = ACTIVE_STATUSES.has(displayStatus);
  const isKnowledge = variant === 'knowledge';
  const isSelectable = !isKnowledge || statusGroup === 'pending' || statusGroup === 'failed';
  const knowledgeStatus = getKnowledgeStatus(displayStatus);
  const showReembed = isKnowledge && statusGroup === 'completed';
  const showRetry = isKnowledge && statusGroup === 'failed';
  const checkboxLabel = `${isSelected ? 'Deselect' : 'Select'} ${document.filename}`;
  const errorMessage = document.error || progress?.error || '';

  return (
    <div className={`transfer-row is-${displayStatus}${isSelected ? ' is-selected' : ''}${!isSelectable ? ' is-disabled' : ''}`}>
      <label className="transfer-row-check">
        <input
          type="checkbox"
          checked={isSelected}
          disabled={!isSelectable}
          aria-label={checkboxLabel}
          onChange={(event) => onSelect(document.id, event.target.checked)}
        />
      </label>

      <div className="transfer-row-main" title={document.filename}>
        <FileIcon filename={document.filename} mimeType={document.mimeType} size={17} />
        <div className="transfer-row-title">
          <strong>{document.filename}</strong>
          <span>{formatSize(document.sizeBytes)}</span>
        </div>
      </div>

      <div className="transfer-row-meta">
        {!isKnowledge ? null : isActive ? (
          <ProgressStatus status={displayStatus} progress={progress} chunkCount={document.chunkCount} />
        ) : (
          <>
            <StatusBadge status={knowledgeStatus} error={errorMessage} />
            {document.chunkCount > 0 && (
              <span className="transfer-chunk-count">{document.chunkCount} chunks</span>
            )}
          </>
        )}
      </div>

      <div className="transfer-row-actions">
        {(showRetry || showReembed) && (
          <button
            className="transfer-row-action"
            type="button"
            disabled={isActionDisabled}
            aria-label={`${showRetry ? 'Retry' : 'Re-embed'} ${document.filename}`}
            onClick={() => onEmbed(document)}
          >
            {showRetry ? <RotateCcw size={14} /> : <Sparkles size={14} />}
            <span>{showRetry ? 'Retry' : 'Re-embed'}</span>
          </button>
        )}

        <button
          className="transfer-row-remove"
          type="button"
          aria-label={`Remove ${document.filename}`}
          onClick={() => onRemove(document)}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
