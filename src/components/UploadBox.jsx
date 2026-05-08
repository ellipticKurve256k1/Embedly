import { useState, useCallback, useRef } from 'react';
import { UploadCloud, File, X, Sparkles } from 'lucide-react';
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
  const [files, setFiles] = useState([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef(null);

  const handleFiles = useCallback((incoming) => {
    const accepted = [];
    const rejected = [];

    Array.from(incoming).forEach((file) => {
      if (isAcceptedFile(file)) {
        accepted.push(file);
      } else {
        rejected.push(file.name);
      }
    });

    if (rejected.length > 0) {
      // eslint-disable-next-line no-alert
      alert(`Skipped unsupported files:\n${rejected.join('\n')}`);
    }

    setFiles((prev) => {
      const names = new Set(prev.map((f) => f.name));
      const unique = accepted.filter((f) => !names.has(f.name));
      return [...prev, ...unique];
    });
  }, []);

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

  const removeFile = useCallback((name) => {
    setFiles((prev) => prev.filter((f) => f.name !== name));
  }, []);

  const embedFile = useCallback((file) => {
    // eslint-disable-next-line no-console
    console.log('Embedding:', file.name);
    // Replace with actual embedding logic when connected to backend
  }, []);

  const embedAllFiles = useCallback(() => {
    // eslint-disable-next-line no-console
    console.log('Embedding all files:', files.map((f) => f.name));
    // Replace with actual batch embedding logic when connected to backend
  }, [files]);

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
        <div className="upload-label">Drop files here or click to upload</div>
        <p className="upload-hint">Accepted: PDF, TXT, MD, CSV</p>
      </div>

      {files.length > 0 && (
        <ul className="file-list" aria-label="Selected files">
          {files.map((file) => (
            <li className="file-item" key={file.name}>
              <File className="file-icon" size={18} />
              <span className="file-name">{file.name}</span>
              <span className="file-size">{formatSize(file.size)}</span>
              <button
                className="file-embed"
                type="button"
                aria-label={`Proceed embedding ${file.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  embedFile(file);
                }}
              >
                <Sparkles size={14} />
                <span>Embed</span>
              </button>
              <button
                className="file-remove"
                type="button"
                aria-label={`Remove ${file.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile(file.name);
                }}
              >
                <X size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {files.length > 0 && (
        <button
          className="embed-all-button"
          type="button"
          onClick={embedAllFiles}
        >
          <Sparkles size={18} />
          <span>Proceed all files embedding</span>
        </button>
      )}
    </div>
  );
}
