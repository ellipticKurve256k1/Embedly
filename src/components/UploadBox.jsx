import { useState, useCallback, useEffect, useRef } from 'react';
import { UploadCloud, File, LoaderCircle, X, Sparkles } from 'lucide-react';
import {
  deleteDocument,
  getDocuments,
  startEmbedding,
  uploadFiles,
} from '../lib/api.js';
import './UploadBox.css';

const ACCEPTED_TYPES = {
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'text/x-markdown': 'md',
  'text/csv': 'csv',
};

const ACCEPTED_EXTENSIONS = ['pdf', 'txt', 'md', 'csv'];

function isAcceptedFile(file) {
  const mimeType = file.type;
  if (ACCEPTED_TYPES[mimeType]) return true;

  const ext = file.name.split('.').pop().toLowerCase();
  return ACCEPTED_EXTENSIONS.includes(ext);
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function LoadingIndicator({ label }) {
  return (
    <span className="loading-indicator" role="status">
      <LoaderCircle size={16} />
      <span>{label}</span>
    </span>
  );
}

function getDisplayStatus(document, isEmbedding) {
  if (isEmbedding) {
    return 'embedding';
  }

  return document.status ?? 'pending';
}

function FileRow({ document, isEmbedding, onEmbed, onRemove }) {
  const displayStatus = getDisplayStatus(document, isEmbedding);

  return (
    <div className="file-row">
      <div className="file-row-header">
        <span className="file-row-name">
          <File className="file-row-icon" size={16} />
          <span>{document.filename}</span>
        </span>
        <span className="file-row-actions">
          {displayStatus === 'pending' && (
            <button
              className="file-row-embed"
              type="button"
              aria-label={`Embed ${document.filename}`}
              onClick={(e) => {
                e.stopPropagation();
                onEmbed(document);
              }}
            >
              <Sparkles size={14} />
              <span>Embed</span>
            </button>
          )}
          {displayStatus === 'failed' && (
            <button
              className="file-row-embed"
              type="button"
              aria-label={`Retry embedding ${document.filename}`}
              onClick={(e) => {
                e.stopPropagation();
                onEmbed(document);
              }}
            >
              <LoaderCircle size={14} />
              <span>Retry</span>
            </button>
          )}
          <button
            className="file-row-remove"
            type="button"
            aria-label={`Remove ${document.filename}`}
            onClick={(e) => {
              e.stopPropagation();
              onRemove(document);
            }}
          >
            <X size={14} />
          </button>
        </span>
      </div>
      <div className="file-row-meta">
        <span className="file-row-size">{formatSize(document.sizeBytes ?? 0)}</span>
        <span className="file-row-dot">•</span>
        <span className={`file-row-status is-${displayStatus}`}>
          {isEmbedding ? 'embedding...' : displayStatus}
        </span>
      </div>
    </div>
  );
}

export default function UploadBox() {
  const [documents, setDocuments] = useState([]);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(true);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [embeddingDocumentIds, setEmbeddingDocumentIds] = useState(() => new Set());
  const [errorMessage, setErrorMessage] = useState('');
  const inputRef = useRef(null);

  const refreshDocuments = useCallback(async () => {
    const payload = await getDocuments();
    setDocuments(payload.documents ?? []);
  }, []);

  useEffect(() => {
    refreshDocuments()
      .catch((error) => {
        setErrorMessage(error instanceof Error ? error.message : 'Unable to load documents.');
      })
      .finally(() => setIsLoadingDocuments(false));
  }, [refreshDocuments]);

  const handleFiles = useCallback(async (incoming) => {
    const accepted = [];
    const rejected = [];
    const existingNames = new Set(documents.map((document) => document.filename));

    Array.from(incoming).forEach((file) => {
      if (isAcceptedFile(file) && !existingNames.has(file.name)) {
        accepted.push(file);
      } else if (!isAcceptedFile(file)) {
        rejected.push(file.name);
      }
    });

    if (rejected.length > 0) {
      // eslint-disable-next-line no-alert
      alert(`Skipped unsupported files:\n${rejected.join('\n')}`);
    }

    if (accepted.length === 0) {
      return;
    }

    setIsUploading(true);
    setErrorMessage('');

    try {
      const payload = await uploadFiles(accepted);
      setDocuments((currentDocuments) => [
        ...(payload.documents ?? []),
        ...currentDocuments,
      ]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Upload failed.');
    } finally {
      setIsUploading(false);
    }
  }, [documents]);

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const onDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      setIsDragOver(false);
      if (e.dataTransfer.files.length) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles]
  );

  const onClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const onKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        inputRef.current?.click();
      }
    },
    []
  );

  const removeDocument = useCallback(async (document) => {
    setErrorMessage('');

    try {
      await deleteDocument(document.id);
      setDocuments((currentDocuments) => (
        currentDocuments.filter((currentDocument) => currentDocument.id !== document.id)
      ));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Delete failed.');
    }
  }, []);

  const embedDocument = useCallback(async (document) => {
    setEmbeddingDocumentIds((currentIds) => new Set(currentIds).add(document.id));
    setErrorMessage('');

    try {
      await startEmbedding([document.id]);
      await refreshDocuments();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Embedding failed.');
    } finally {
      setEmbeddingDocumentIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.delete(document.id);
        return nextIds;
      });
    }
  }, [refreshDocuments]);

  const embedAllDocuments = useCallback(async () => {
    const documentIds = documents.map((document) => document.id);

    if (documentIds.length === 0) {
      return;
    }

    setEmbeddingDocumentIds(new Set(documentIds));
    setErrorMessage('');

    try {
      await startEmbedding(documentIds);
      await refreshDocuments();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Embedding failed.');
    } finally {
      setEmbeddingDocumentIds(new Set());
    }
  }, [documents, refreshDocuments]);

  const hasFiles = documents.length > 0;
  const pendingCount = documents.filter((d) => (d.status ?? 'pending') === 'pending').length;
  const completedCount = documents.filter((d) => d.status === 'completed').length;

  return (
    <div className={`upload-stage${hasFiles ? ' has-files' : ''}`}>
      <div className={`upload-workspace${hasFiles ? ' has-files' : ''}`}>
        <div className="upload-main">
          <div
            className={`upload-box${isDragOver ? ' is-drag-over' : ''}${isUploading ? ' is-loading' : ''}`}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={onClick}
            onKeyDown={onKeyDown}
            role="button"
            tabIndex={0}
            aria-label="Drop files here or click to upload"
          >
            <input
              ref={inputRef}
              className="upload-input"
              type="file"
              multiple
              accept=".pdf,.txt,.md,.csv"
              onChange={(e) => {
                if (e.target.files.length) handleFiles(e.target.files);
                e.target.value = '';
              }}
            />

            {isUploading ? (
              <LoadingIndicator label="Uploading files" />
            ) : (
              <>
                <UploadCloud size={44} />
                <div className="upload-label">Drop files here or click to upload</div>
              </>
            )}
            <p className="upload-hint">Accepted: PDF, TXT, MD, CSV</p>
          </div>

          {errorMessage && (
            <div className="upload-message is-error" role="alert">
              {errorMessage}
            </div>
          )}

          {hasFiles && pendingCount > 0 && (
            <button
              className="embed-all-button"
              type="button"
              disabled={embeddingDocumentIds.size > 0}
              onClick={embedAllDocuments}
            >
              {embeddingDocumentIds.size > 0 ? (
                <LoadingIndicator label="Embedding files" />
              ) : (
                <>
                  <Sparkles size={18} />
                  <span>Proceed all files embedding</span>
                </>
              )}
            </button>
          )}
        </div>

        {hasFiles && (
          <aside className="file-panel" aria-label="Uploaded documents">
            <header className="file-panel-header">
              <span className="file-panel-title">
                <strong>Uploaded Files</strong>
                <span className="file-panel-count">{documents.length}</span>
              </span>
              {completedCount > 0 && (
                <span className="file-panel-done">{completedCount} done</span>
              )}
            </header>

            <div className="file-panel-list">
              {isLoadingDocuments ? (
                <div className="file-panel-empty">
                  <LoadingIndicator label="Loading files" />
                </div>
              ) : (
                documents.map((document) => (
                  <FileRow
                    key={document.id}
                    document={document}
                    isEmbedding={embeddingDocumentIds.has(document.id)}
                    onEmbed={embedDocument}
                    onRemove={removeDocument}
                  />
                ))
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
