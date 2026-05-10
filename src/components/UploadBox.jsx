import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  deleteDocument,
  getDocuments,
  getJobs,
  startEmbedding,
  uploadFiles,
} from '../lib/api.js';
import EmbedActionBar from './EmbedActionBar.jsx';
import FileDropZone from './FileDropZone.jsx';
import TransferControls from './TransferControls.jsx';
import TransferPane from './TransferPane.jsx';
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

  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  return ACCEPTED_EXTENSIONS.includes(extension);
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

function isEmbeddable(view) {
  return view.statusGroup === 'pending' || view.statusGroup === 'failed';
}

function formatFileList(files) {
  return files.map((file) => ({
    id: `${file.name}-${file.size}-${file.lastModified}`,
    name: file.name,
    size: file.size,
  }));
}

export default function UploadBox() {
  const [documents, setDocuments] = useState([]);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(true);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [leftSearch, setLeftSearch] = useState('');
  const [debouncedLeftSearch, setDebouncedLeftSearch] = useState('');
  const [leftSelection, setLeftSelection] = useState(() => new Set());
  const [rightPaneIds, setRightPaneIds] = useState(() => new Set());
  const [rightSelection, setRightSelection] = useState(() => new Set());
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
      setDebouncedLeftSearch(leftSearch.trim().toLowerCase());
    }, 200);

    return () => window.clearTimeout(timeoutId);
  }, [leftSearch]);

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

  useEffect(() => {
    const existingIds = new Set(documentViews.map((view) => view.document.id));
    const eligibleIds = new Set(documentViews.filter(isEmbeddable).map((view) => view.document.id));

    setLeftSelection((currentIds) => (
      new Set([...currentIds].filter((id) => existingIds.has(id)))
    ));
    setRightPaneIds((currentIds) => (
      new Set([...currentIds].filter((id) => existingIds.has(id) && eligibleIds.has(id)))
    ));
    setRightSelection((currentIds) => (
      new Set([...currentIds].filter((id) => existingIds.has(id)))
    ));
  }, [documentViews]);

  const leftViews = useMemo(() => (
    documentViews.filter((view) => !rightPaneIds.has(view.document.id))
  ), [documentViews, rightPaneIds]);

  const visibleLeftViews = useMemo(() => {
    const searchedViews = leftViews.filter(({ document }) => (
      !debouncedLeftSearch || document.filename.toLowerCase().includes(debouncedLeftSearch)
    ));

    return searchedViews.sort((a, b) => {
      const aTime = new Date(a.document.createdAt).getTime();
      const bTime = new Date(b.document.createdAt).getTime();
      return bTime - aTime;
    });
  }, [debouncedLeftSearch, leftViews]);

  const rightViews = useMemo(() => (
    documentViews
      .filter((view) => rightPaneIds.has(view.document.id))
      .sort((a, b) => a.document.filename.localeCompare(b.document.filename))
  ), [documentViews, rightPaneIds]);

  const eligibleLeftIds = useMemo(() => (
    leftViews.filter(isEmbeddable).map((view) => view.document.id)
  ), [leftViews]);

  const visibleEligibleLeftIds = useMemo(() => (
    visibleLeftViews.filter(isEmbeddable).map((view) => view.document.id)
  ), [visibleLeftViews]);

  const selectedEligibleLeftIds = useMemo(() => (
    eligibleLeftIds.filter((id) => leftSelection.has(id))
  ), [eligibleLeftIds, leftSelection]);

  const rightIds = useMemo(() => (
    rightViews.map((view) => view.document.id)
  ), [rightViews]);

  const allVisibleLeftSelected = visibleEligibleLeftIds.length > 0
    && visibleEligibleLeftIds.every((id) => leftSelection.has(id));
  const allRightSelected = rightIds.length > 0
    && rightIds.every((id) => rightSelection.has(id));

  const selectedRightIds = rightIds.filter((id) => rightSelection.has(id));
  const queuedDocuments = rightViews.map((view) => view.document);
  const isEmbeddingAny = embeddingDocumentIds.size > 0;

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
    setUploadingFiles(formatFileList(accepted));

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

  const onDrop = useCallback((event) => {
    event.preventDefault();
    setIsDragOver(false);

    if (event.dataTransfer.files.length) {
      handleFiles(event.dataTransfer.files);
    }
  }, [handleFiles]);

  const openFilePicker = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const onDropZoneKeyDown = useCallback((event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openFilePicker();
    }
  }, [openFilePicker]);

  const selectLeftFile = useCallback((documentId, isSelected) => {
    setLeftSelection((currentIds) => {
      const nextIds = new Set(currentIds);

      if (isSelected) {
        nextIds.add(documentId);
      } else {
        nextIds.delete(documentId);
      }

      return nextIds;
    });
  }, []);

  const selectRightFile = useCallback((documentId, isSelected) => {
    setRightSelection((currentIds) => {
      const nextIds = new Set(currentIds);

      if (isSelected) {
        nextIds.add(documentId);
      } else {
        nextIds.delete(documentId);
      }

      return nextIds;
    });
  }, []);

  const toggleVisibleLeftSelection = useCallback((isSelected) => {
    setLeftSelection((currentIds) => {
      const nextIds = new Set(currentIds);

      visibleEligibleLeftIds.forEach((id) => {
        if (isSelected) {
          nextIds.add(id);
        } else {
          nextIds.delete(id);
        }
      });

      return nextIds;
    });
  }, [visibleEligibleLeftIds]);

  const toggleRightSelection = useCallback((isSelected) => {
    setRightSelection(isSelected ? new Set(rightIds) : new Set());
  }, [rightIds]);

  const moveSelectedRight = useCallback(() => {
    if (selectedEligibleLeftIds.length === 0) {
      return;
    }

    setRightPaneIds((currentIds) => new Set([...currentIds, ...selectedEligibleLeftIds]));
    setLeftSelection((currentIds) => {
      const nextIds = new Set(currentIds);
      selectedEligibleLeftIds.forEach((id) => nextIds.delete(id));
      return nextIds;
    });
  }, [selectedEligibleLeftIds]);

  const moveAllRight = useCallback(() => {
    if (eligibleLeftIds.length === 0) {
      return;
    }

    setRightPaneIds((currentIds) => new Set([...currentIds, ...eligibleLeftIds]));
    setLeftSelection((currentIds) => {
      const nextIds = new Set(currentIds);
      eligibleLeftIds.forEach((id) => nextIds.delete(id));
      return nextIds;
    });
  }, [eligibleLeftIds]);

  const moveSelectedLeft = useCallback(() => {
    if (selectedRightIds.length === 0) {
      return;
    }

    setRightPaneIds((currentIds) => {
      const nextIds = new Set(currentIds);
      selectedRightIds.forEach((id) => nextIds.delete(id));
      return nextIds;
    });
    setRightSelection(new Set());
  }, [selectedRightIds]);

  const moveAllLeft = useCallback(() => {
    setRightPaneIds(new Set());
    setRightSelection(new Set());
  }, []);

  const removeDocument = useCallback(async (document) => {
    const confirmed = window.confirm(`Remove ${document.filename}?`);
    if (!confirmed) {
      return;
    }

    setErrorMessage('');

    try {
      await deleteDocument(document.id);
      setDocuments((currentDocuments) => (
        currentDocuments.filter((currentDocument) => currentDocument.id !== document.id)
      ));
      setLeftSelection((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.delete(document.id);
        return nextIds;
      });
      setRightPaneIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.delete(document.id);
        return nextIds;
      });
      setRightSelection((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.delete(document.id);
        return nextIds;
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Delete failed.');
    }
  }, []);

  const embedQueuedDocuments = useCallback(async () => {
    const documentIds = queuedDocuments.map((document) => document.id);

    if (documentIds.length === 0) {
      return;
    }

    setErrorMessage('');
    setEmbeddingDocumentIds((currentIds) => new Set([...currentIds, ...documentIds]));
    setRightPaneIds((currentIds) => {
      const nextIds = new Set(currentIds);
      documentIds.forEach((id) => nextIds.delete(id));
      return nextIds;
    });
    setRightSelection(new Set());

    try {
      await startEmbedding(documentIds);
      await refreshDocuments();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Embedding failed.');
      await refreshDocuments().catch(() => {});
    } finally {
      setEmbeddingDocumentIds((currentIds) => {
        const nextIds = new Set(currentIds);
        documentIds.forEach((id) => nextIds.delete(id));
        return nextIds;
      });
    }
  }, [queuedDocuments, refreshDocuments]);

  const clearQueue = useCallback(() => {
    setRightPaneIds(new Set());
    setRightSelection(new Set());
  }, []);

  return (
    <div className="upload-stage">
      <div className="upload-workspace">
        <FileDropZone
          inputRef={inputRef}
          isDragOver={isDragOver}
          isUploading={isUploading}
          uploadingCount={uploadingFiles.length}
          onClick={openFilePicker}
          onKeyDown={onDropZoneKeyDown}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onFilesSelected={handleFiles}
        />

        {errorMessage && (
          <div className="upload-message is-error" role="alert">
            {errorMessage}
          </div>
        )}

        <section className="transfer-workspace" aria-label="Upload selection workspace">
          <TransferPane
            title="Available Files"
            count={leftViews.length + uploadingFiles.length}
            variant="available"
            views={visibleLeftViews}
            uploadingFiles={uploadingFiles}
            isLoading={isLoadingDocuments}
            searchValue={leftSearch}
            onSearchChange={setLeftSearch}
            selectedIds={leftSelection}
            allSelectableSelected={allVisibleLeftSelected}
            selectableCount={visibleEligibleLeftIds.length}
            onSelectAll={toggleVisibleLeftSelection}
            onSelectFile={selectLeftFile}
            onRemoveFile={removeDocument}
            emptyTitle={documents.length === 0 ? 'Upload files to build your pool' : 'No files match this search'}
            emptyBody={documents.length === 0
              ? 'Files stay here until you move them into the embedding queue.'
              : 'Clear or change the search filter to see more files.'}
          />

          <TransferControls
            canMoveSelectedRight={selectedEligibleLeftIds.length > 0}
            canMoveAllRight={eligibleLeftIds.length > 0}
            canMoveSelectedLeft={selectedRightIds.length > 0}
            canMoveAllLeft={rightViews.length > 0}
            onMoveSelectedRight={moveSelectedRight}
            onMoveAllRight={moveAllRight}
            onMoveSelectedLeft={moveSelectedLeft}
            onMoveAllLeft={moveAllLeft}
          />

          <TransferPane
            title="Files to Embed"
            count={rightViews.length}
            variant="queue"
            views={rightViews}
            selectedIds={rightSelection}
            allSelectableSelected={allRightSelected}
            selectableCount={rightViews.length}
            onSelectAll={toggleRightSelection}
            onSelectFile={selectRightFile}
            onRemoveFile={removeDocument}
            onClearAll={clearQueue}
            emptyTitle="No files selected for embedding"
            emptyBody="Move pending or failed files here before starting an embedding job."
          />
        </section>

        <EmbedActionBar
          documents={queuedDocuments}
          isEmbedding={isEmbeddingAny}
          onEmbed={embedQueuedDocuments}
          onCancel={clearQueue}
        />
      </div>
    </div>
  );
}
