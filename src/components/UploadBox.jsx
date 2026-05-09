import { useState, useCallback, useEffect, useRef } from 'react';
import { UploadCloud, File, X, Sparkles } from 'lucide-react';
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

export default function UploadBox() {
  const [documents, setDocuments] = useState([]);
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
    refreshDocuments().catch((error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load documents.');
    });
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

  return (
    <div className="upload-stage">
      <div
        className={`upload-box${isDragOver ? ' is-drag-over' : ''}`}
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

        <UploadCloud size={44} />
        <div className="upload-label">
          {isUploading ? 'Uploading files...' : 'Drop files here or click to upload'}
        </div>
        <p className="upload-hint">Accepted: PDF, TXT, MD, CSV</p>
      </div>

      {errorMessage && (
        <div className="upload-message is-error" role="alert">
          {errorMessage}
        </div>
      )}

      {documents.length > 0 && (
        <ul className="file-list" aria-label="Uploaded documents">
          {documents.map((document) => {
            const isEmbedding = embeddingDocumentIds.has(document.id);

            return (
            <li className="file-item" key={document.id}>
              <File className="file-icon" size={18} />
              <span className="file-name">{document.filename}</span>
              <span className={`file-status is-${document.status}`}>{document.status}</span>
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
                <Sparkles size={14} />
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

      {documents.length > 0 && (
        <button
          className="embed-all-button"
          type="button"
          disabled={embeddingDocumentIds.size > 0}
          onClick={embedAllDocuments}
        >
          <Sparkles size={18} />
          <span>
            {embeddingDocumentIds.size > 0 ? 'Embedding files...' : 'Proceed all files embedding'}
          </span>
        </button>
      )}
    </div>
  );
}
