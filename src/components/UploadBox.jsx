import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { LoaderCircle, Sparkles, UploadCloud } from 'lucide-react';
import {
  deleteDocument,
  getDocuments,
  getJobs,
  startEmbedding,
  uploadFiles,
} from '../lib/api.js';
import FileIcon from './FileIcon.jsx';
import FileRow from './FileRow.jsx';
import FileTableToolbar from './FileTableToolbar.jsx';
import './UploadBox.css';

const ACCEPTED_TYPES = {
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'text/x-markdown': 'md',
  'text/csv': 'csv',
};

const ACCEPTED_EXTENSIONS = ['pdf', 'txt', 'md', 'csv'];
const ACTIVE_STATUSES = new Set(['parsing', 'chunking', 'embedding', 'indexing']);
const TERMINAL_JOB_STATUSES = new Set(['completed', 'failed']);

function isAcceptedFile(file) {
  const mimeType = file.type;
  if (ACCEPTED_TYPES[mimeType]) return true;

  const ext = file.name.split('.').pop().toLowerCase();
  return ACCEPTED_EXTENSIONS.includes(ext);
}

function formatSize(bytes = 0) {
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

function getDisplayStatus(document, embeddingDocumentIds, jobProgress) {
  const progress = jobProgress[document.id];
  const documentStatus = document.status ?? 'pending';
  const progressStage = progress?.stage;

  if (embeddingDocumentIds.has(document.id)) {
    if (ACTIVE_STATUSES.has(progressStage)) return progressStage;
    if (ACTIVE_STATUSES.has(documentStatus)) return documentStatus;
    return 'embedding';
  }

  if (ACTIVE_STATUSES.has(documentStatus)) return documentStatus;

  if (progress?.status === 'running') {
    return ACTIVE_STATUSES.has(progressStage) ? progressStage : 'embedding';
  }

  return documentStatus;
}

function getStatusGroup(displayStatus) {
  if (ACTIVE_STATUSES.has(displayStatus)) return 'embedding';
  if (displayStatus === 'completed') return 'completed';
  if (displayStatus === 'failed') return 'failed';
  return 'pending';
}

function sortDocuments(documents, sortBy) {
  const nextDocuments = [...documents];

  nextDocuments.sort((a, b) => {
    if (sortBy === 'oldest') {
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    }

    if (sortBy === 'name') {
      return a.filename.localeCompare(b.filename);
    }

    if (sortBy === 'size') {
      return (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0);
    }

    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return nextDocuments;
}

function UploadingFileRow({ file }) {
  return (
    <div className="file-table-row is-uploading">
      <div className="file-table-cell file-table-checkbox" aria-hidden="true" />
      <div className="file-table-cell file-table-name" title={file.name}>
        <FileIcon filename={file.name} size={18} />
        <span>{file.name}</span>
      </div>
      <div className="file-table-cell" data-label="Type">-</div>
      <div className="file-table-cell" data-label="Size">{formatSize(file.size)}</div>
      <div className="file-table-cell file-table-status" data-label="Status">
        <LoadingIndicator label="Uploading..." />
      </div>
      <div className="file-table-cell" data-label="Chunks">-</div>
      <div className="file-table-cell" data-label="Date">Just now</div>
      <div className="file-table-cell file-table-actions" />
    </div>
  );
}

export default function UploadBox() {
  const [documents, setDocuments] = useState([]);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(true);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [embeddingDocumentIds, setEmbeddingDocumentIds] = useState(() => new Set());
  const [jobProgress, setJobProgress] = useState({});
  const [uploadingFiles, setUploadingFiles] = useState([]);
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

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim().toLowerCase());
    }, 200);

    return () => window.clearTimeout(timeoutId);
  }, [searchQuery]);

  useEffect(() => {
    setSelectedIds((currentIds) => {
      const existingIds = new Set(documents.map((document) => document.id));
      return new Set([...currentIds].filter((id) => existingIds.has(id)));
    });
  }, [documents]);

  useEffect(() => {
    const activeDocumentIds = new Set([
      ...documents
        .filter((document) => ACTIVE_STATUSES.has(document.status))
        .map((document) => document.id),
      ...embeddingDocumentIds,
    ]);

    if (activeDocumentIds.size === 0) {
      return undefined;
    }

    let isCancelled = false;

    async function pollJobs() {
      try {
        const payload = await getJobs();
        if (isCancelled) return;

        const latestByDocumentId = {};

        (payload.jobs ?? []).forEach((job) => {
          if (!latestByDocumentId[job.documentId]) {
            latestByDocumentId[job.documentId] = job;
          }
        });

        setJobProgress(latestByDocumentId);

        const settledIds = [...activeDocumentIds].filter((id) => (
          TERMINAL_JOB_STATUSES.has(latestByDocumentId[id]?.status)
        ));

        if (settledIds.length > 0) {
          setEmbeddingDocumentIds((currentIds) => {
            const nextIds = new Set(currentIds);
            settledIds.forEach((id) => nextIds.delete(id));
            return nextIds;
          });
        }

        const allKnownJobsSettled = [...activeDocumentIds].every((id) => (
          latestByDocumentId[id] && TERMINAL_JOB_STATUSES.has(latestByDocumentId[id].status)
        ));

        if (allKnownJobsSettled) {
          await refreshDocuments();
        }
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load embedding progress.');
        }
      }
    }

    pollJobs();
    const intervalId = window.setInterval(pollJobs, 1500);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [documents, embeddingDocumentIds, refreshDocuments]);

  const documentViews = useMemo(() => (
    documents.map((document) => {
      const displayStatus = getDisplayStatus(document, embeddingDocumentIds, jobProgress);

      return {
        document,
        displayStatus,
        statusGroup: getStatusGroup(displayStatus),
        progress: jobProgress[document.id],
      };
    })
  ), [documents, embeddingDocumentIds, jobProgress]);

  const statusCounts = useMemo(() => {
    const counts = {
      all: documentViews.length,
      pending: 0,
      embedding: 0,
      completed: 0,
      failed: 0,
    };

    documentViews.forEach((view) => {
      counts[view.statusGroup] += 1;
    });

    return counts;
  }, [documentViews]);

  const visibleDocumentViews = useMemo(() => {
    const searchedViews = documentViews.filter(({ document, statusGroup }) => {
      const matchesSearch = !debouncedSearchQuery
        || document.filename.toLowerCase().includes(debouncedSearchQuery);
      const matchesStatus = statusFilter === 'all' || statusGroup === statusFilter;

      return matchesSearch && matchesStatus;
    });

    const sortedDocuments = sortDocuments(
      searchedViews.map((view) => view.document),
      sortBy,
    );
    const viewsById = new Map(searchedViews.map((view) => [view.document.id, view]));

    return sortedDocuments.map((document) => viewsById.get(document.id));
  }, [debouncedSearchQuery, documentViews, sortBy, statusFilter]);

  const selectedDocuments = useMemo(() => (
    documentViews
      .filter(({ document }) => selectedIds.has(document.id))
      .map(({ document, statusGroup }) => ({ document, statusGroup }))
  ), [documentViews, selectedIds]);

  const canEmbedSelected = selectedDocuments.some(({ statusGroup }) => (
    statusGroup === 'pending' || statusGroup === 'failed'
  ));
  const failedVisibleDocuments = visibleDocumentViews
    .filter(({ statusGroup }) => statusGroup === 'failed')
    .map(({ document }) => document);
  const visibleDocumentIds = visibleDocumentViews.map(({ document }) => document.id);
  const allVisibleSelected = visibleDocumentIds.length > 0
    && visibleDocumentIds.every((id) => selectedIds.has(id));
  const embeddableDocuments = documentViews
    .filter(({ statusGroup }) => statusGroup === 'pending' || statusGroup === 'failed')
    .map(({ document }) => document);

  const handleFiles = useCallback(async (incoming) => {
    const accepted = [];
    const rejected = [];
    const existingNames = new Set([
      ...documents.map((document) => document.filename),
      ...uploadingFiles.map((file) => file.name),
    ]);

    Array.from(incoming).forEach((file) => {
      if (isAcceptedFile(file) && !existingNames.has(file.name)) {
        accepted.push(file);
      } else if (!isAcceptedFile(file)) {
        rejected.push(file.name);
      }
    });

    if (rejected.length > 0) {
      setErrorMessage(`Skipped unsupported files: ${rejected.join(', ')}`);
    }

    if (accepted.length === 0) {
      return;
    }

    setIsUploading(true);
    setErrorMessage('');
    setUploadingFiles(accepted.map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}`,
      name: file.name,
      size: file.size,
    })));

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
      setUploadingFiles([]);
    }
  }, [documents, uploadingFiles]);

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    setIsDragOver(true);
  }, []);

  const onDragLeave = useCallback((event) => {
    event.preventDefault();
    setIsDragOver(false);
  }, []);

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      setIsDragOver(false);
      if (event.dataTransfer.files.length) {
        handleFiles(event.dataTransfer.files);
      }
    },
    [handleFiles]
  );

  const onClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const onKeyDown = useCallback((event) => {
    if (event.target !== event.currentTarget) {
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      inputRef.current?.click();
    }
  }, []);

  const removeDocument = useCallback(async (document) => {
    setErrorMessage('');

    try {
      await deleteDocument(document.id);
      setDocuments((currentDocuments) => (
        currentDocuments.filter((currentDocument) => currentDocument.id !== document.id)
      ));
      setSelectedIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.delete(document.id);
        return nextIds;
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Delete failed.');
    }
  }, []);

  const embedDocuments = useCallback(async (documentsToEmbed) => {
    const documentIds = documentsToEmbed.map((document) => document.id);

    if (documentIds.length === 0) {
      return;
    }

    setEmbeddingDocumentIds((currentIds) => new Set([...currentIds, ...documentIds]));
    setErrorMessage('');

    try {
      await startEmbedding(documentIds);
      await refreshDocuments();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Embedding failed.');
    } finally {
      setEmbeddingDocumentIds((currentIds) => {
        const nextIds = new Set(currentIds);
        documentIds.forEach((id) => nextIds.delete(id));
        return nextIds;
      });
    }
  }, [refreshDocuments]);

  const embedDocument = useCallback((document) => (
    embedDocuments([document])
  ), [embedDocuments]);

  const embedSelectedDocuments = useCallback(() => {
    const selectedEmbeddableDocuments = selectedDocuments
      .filter(({ statusGroup }) => statusGroup === 'pending' || statusGroup === 'failed')
      .map(({ document }) => document);

    embedDocuments(selectedEmbeddableDocuments);
  }, [embedDocuments, selectedDocuments]);

  const retryFailedDocuments = useCallback(() => {
    embedDocuments(failedVisibleDocuments);
  }, [embedDocuments, failedVisibleDocuments]);

  const embedPendingDocuments = useCallback(() => {
    embedDocuments(embeddableDocuments);
  }, [embedDocuments, embeddableDocuments]);

  const deleteSelectedDocuments = useCallback(async () => {
    const documentsToDelete = selectedDocuments.map(({ document }) => document);

    if (documentsToDelete.length === 0) {
      return;
    }

    const confirmed = window.confirm(`Delete ${documentsToDelete.length} selected file(s)?`);
    if (!confirmed) {
      return;
    }

    setErrorMessage('');

    try {
      await Promise.all(documentsToDelete.map((document) => deleteDocument(document.id)));
      const deletedIds = new Set(documentsToDelete.map((document) => document.id));
      setDocuments((currentDocuments) => (
        currentDocuments.filter((document) => !deletedIds.has(document.id))
      ));
      setSelectedIds(new Set());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Delete failed.');
      await refreshDocuments();
    }
  }, [refreshDocuments, selectedDocuments]);

  const selectDocument = useCallback((documentId, isSelected) => {
    setSelectedIds((currentIds) => {
      const nextIds = new Set(currentIds);

      if (isSelected) {
        nextIds.add(documentId);
      } else {
        nextIds.delete(documentId);
      }

      return nextIds;
    });
  }, []);

  const toggleVisibleSelection = useCallback((isSelected) => {
    setSelectedIds((currentIds) => {
      const nextIds = new Set(currentIds);

      visibleDocumentIds.forEach((id) => {
        if (isSelected) {
          nextIds.add(id);
        } else {
          nextIds.delete(id);
        }
      });

      return nextIds;
    });
  }, [visibleDocumentIds]);

  const hasRows = visibleDocumentViews.length > 0 || uploadingFiles.length > 0;
  const hasDocuments = documents.length > 0;
  const isEmbeddingAny = embeddingDocumentIds.size > 0;

  return (
    <div className="upload-stage">
      <div className="upload-workspace">
        <FileTableToolbar
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          statusCounts={statusCounts}
          sortBy={sortBy}
          onSortByChange={setSortBy}
          selectedCount={selectedIds.size}
          canEmbedSelected={canEmbedSelected}
          failedVisibleCount={failedVisibleDocuments.length}
          onEmbedSelected={embedSelectedDocuments}
          onRetryFailed={retryFailedDocuments}
          onDeleteSelected={deleteSelectedDocuments}
        />

        <section
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
            onChange={(event) => {
              if (event.target.files.length) handleFiles(event.target.files);
              event.target.value = '';
            }}
          />

          <div className="upload-box-main">
            <span className="upload-box-icon">
              {isUploading ? <LoaderCircle size={22} /> : <UploadCloud size={22} />}
            </span>
            <div>
              <strong>{isUploading ? 'Uploading files' : 'Drop files here or click to upload'}</strong>
              <p>Accepted: PDF, TXT, MD, CSV</p>
            </div>
          </div>

          {embeddableDocuments.length > 0 && (
            <button
              className="upload-embed-button"
              type="button"
              disabled={isEmbeddingAny}
              onClick={(event) => {
                event.stopPropagation();
                embedPendingDocuments();
              }}
            >
              {isEmbeddingAny ? (
                <LoadingIndicator label="Embedding" />
              ) : (
                <>
                  <Sparkles size={15} />
                  <span>Embed pending</span>
                </>
              )}
            </button>
          )}
        </section>

        {errorMessage && (
          <div className="upload-message is-error" role="alert">
            {errorMessage}
          </div>
        )}

        <section className="file-table-panel" aria-label="Uploaded documents">
          <header className="file-table-summary">
            <div>
              <strong>Files</strong>
              <span>{documents.length} uploaded</span>
            </div>
            <span>{statusCounts.completed} completed</span>
          </header>

          <div className="file-table-scroll">
            <div className="file-table-header" role="row">
              <div className="file-table-cell file-table-checkbox">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  disabled={visibleDocumentIds.length === 0}
                  aria-label="Select visible files"
                  onChange={(event) => toggleVisibleSelection(event.target.checked)}
                />
              </div>
              <div className="file-table-cell">Name</div>
              <div className="file-table-cell">Type</div>
              <div className="file-table-cell">Size</div>
              <div className="file-table-cell">Status</div>
              <div className="file-table-cell">Chunks</div>
              <div className="file-table-cell">Date</div>
              <div className="file-table-cell">Actions</div>
            </div>

            <div className="file-table-body">
              {uploadingFiles.map((file) => (
                <UploadingFileRow key={file.id} file={file} />
              ))}

              {isLoadingDocuments ? (
                <div className="file-table-empty">
                  <LoadingIndicator label="Loading files" />
                </div>
              ) : (
                visibleDocumentViews.map(({ document, displayStatus, progress }) => (
                  <FileRow
                    key={document.id}
                    document={document}
                    displayStatus={displayStatus}
                    progress={progress}
                    isSelected={selectedIds.has(document.id)}
                    onSelect={selectDocument}
                    onEmbed={embedDocument}
                    onRemove={removeDocument}
                  />
                ))
              )}

              {!isLoadingDocuments && !hasRows && (
                <div className="file-table-empty">
                  <UploadCloud size={28} />
                  <strong>
                    {hasDocuments
                      ? 'No files match the current view'
                      : 'Drop files here or click upload to get started'}
                  </strong>
                  <span>
                    {hasDocuments
                      ? 'Adjust the search, status filter, or sort order.'
                      : 'Uploaded files will appear in this workspace.'}
                  </span>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
