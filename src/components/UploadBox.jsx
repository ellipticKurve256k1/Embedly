import { useState, useCallback, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, UploadCloud, File, LoaderCircle, X, Sparkles } from 'lucide-react';
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

export default function UploadBox() {
  const [documents, setDocuments] = useState([]);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(true);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [embeddingDocumentIds, setEmbeddingDocumentIds] = useState(() => new Set());
  const [errorMessage, setErrorMessage] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
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
      setIsSidebarOpen(true);
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
    setIsSidebarOpen(true);
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
    setIsSidebarOpen(true);
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

  return (
    <div className="upload-stage">
      <div className={`upload-workspace${isSidebarOpen ? ' is-sidebar-open' : ''}`}>
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

          {documents.length > 0 && (
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

        <button
          className="upload-sidebar-toggle"
          type="button"
          aria-expanded={isSidebarOpen}
          aria-controls="uploaded-file-sidebar"
          onClick={() => setIsSidebarOpen((currentValue) => !currentValue)}
        >
          {isSidebarOpen ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          <span>Files</span>
          <strong>{documents.length}</strong>
        </button>

        {isSidebarOpen && (
          <aside
            className="upload-status-sidebar"
            id="uploaded-file-sidebar"
            aria-label="Embedded file status"
          >
          <div className="upload-sidebar-heading">
            <span>
              <strong>File status</strong>
              <small>{documents.length} uploaded</small>
            </span>
            <button
              className="upload-sidebar-close"
              type="button"
              aria-label="Close file status sidebar"
              onClick={() => setIsSidebarOpen(false)}
            >
              <X size={16} />
            </button>
            {isLoadingDocuments && <LoaderCircle size={16} />}
          </div>

          {isLoadingDocuments && (
            <div className="upload-sidebar-empty">
              <LoadingIndicator label="Loading files" />
            </div>
          )}

          {!isLoadingDocuments && documents.length === 0 && (
            <div className="upload-sidebar-empty">
              Uploaded files will appear here.
            </div>
          )}

          {documents.length > 0 && (
            <ul className="file-list" aria-label="Uploaded documents">
              {documents.map((document) => {
                const isEmbedding = embeddingDocumentIds.has(document.id);
                const displayStatus = getDisplayStatus(document, isEmbedding);

                return (
                  <li className="file-item" key={document.id}>
                    <File className="file-icon" size={18} />
                    <span className="file-name">{document.filename}</span>
                    <span className={`file-status is-${displayStatus}`}>{displayStatus}</span>
                    <span className="file-size">{formatSize(document.sizeBytes ?? 0)}</span>
                    <button
                      className="file-embed"
                      type="button"
                      disabled={isEmbedding}
                      aria-label={`Proceed embedding ${document.filename}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        embedDocument(document);
                      }}
                    >
                      {isEmbedding ? <LoaderCircle size={14} /> : <Sparkles size={14} />}
                      <span>{isEmbedding ? 'Embedding' : 'Embed'}</span>
                    </button>
                    <button
                      className="file-remove"
                      type="button"
                      aria-label={`Remove ${document.filename}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        removeDocument(document);
                      }}
                    >
                      <X size={16} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          </aside>
        )}
      </div>
    </div>
  );
}
