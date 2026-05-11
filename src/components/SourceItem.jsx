import { ExternalLink, FileText } from 'lucide-react';
import './SourceItem.css';

function formatScore(score) {
  if (typeof score !== 'number') return 'Unknown';
  return `${Math.round(score * 100)}%`;
}

function openDocument(documentId) {
  if (!documentId) return;

  window.open(
    `http://localhost:3001/api/documents/${encodeURIComponent(documentId)}`,
    '_blank',
    'noopener,noreferrer',
  );
}

export default function SourceItem({ number, chunk, isCited = false }) {
  const documentName = chunk?.documentName || 'Untitled document';

  return (
    <article className={`source-item${isCited ? ' is-cited' : ''}`}>
      <span className="source-item__number">[{number}]</span>
      <span className="source-item__icon" aria-hidden="true">
        <FileText size={15} />
      </span>
      <span className="source-item__body">
        <strong>{documentName}</strong>
        <small>
          Chunk {chunk?.chunkIndex != null ? chunk.chunkIndex + 1 : 'unknown'}
          {typeof chunk?.totalChunks === 'number' ? ` of ${chunk.totalChunks}` : ''}
        </small>
      </span>
      <span className="source-item__score">{formatScore(chunk?.score)}</span>
      {isCited && <span className="source-item__cited">Cited</span>}
      <button
        className="source-item__open"
        type="button"
        aria-label={`View ${documentName}`}
        onClick={() => openDocument(chunk?.documentId)}
        disabled={!chunk?.documentId}
      >
        <ExternalLink size={14} />
      </button>
    </article>
  );
}
