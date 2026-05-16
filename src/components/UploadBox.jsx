import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  deleteDocument,
  getDocuments,
  getJobs,
  startEmbedding,
  updateDocumentProject,
  uploadFiles,
} from '../lib/api.js';
import EmbedActionBar from './EmbedActionBar.jsx';
import FileDropZone from './FileDropZone.jsx';
import ProjectSelector from './ProjectSelector.jsx';
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
const KNOWLEDGE_BASE_IDS_STORAGE_KEY = 'embeddly.knowledgeBaseIds';

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
  const progressStatus = progress?.status;

  if (TERMINAL_JOB_STATUSES.has(documentStatus)) return documentStatus;
  if (TERMINAL_JOB_STATUSES.has(progressStatus)) return progressStatus;
  if (TERMINAL_JOB_STATUSES.has(progressStage)) return progressStage;

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

function canReturnToAvailable(view) {
  return view.statusGroup === 'pending' || view.statusGroup === 'failed';
}

function shouldAutoKeepInKnowledgeBase(view) {
  return view.statusGroup === 'completed' || view.statusGroup === 'embedding';
}

function formatFileList(files) {
  return files.map((file) => ({
    id: `${file.name}-${file.size}-${file.lastModified}`,
    name: file.name,
    size: file.size,
  }));
}

function readSavedKnowledgeBaseIds() {
  try {
    const rawIds = window.localStorage.getItem(KNOWLEDGE_BASE_IDS_STORAGE_KEY);
    const parsedIds = rawIds ? JSON.parse(rawIds) : [];
    return new Set(Array.isArray(parsedIds) ? parsedIds.filter(Boolean) : []);
  } catch {
    return new Set();
  }
}

function saveKnowledgeBaseIds(ids) {
  try {
    window.localStorage.setItem(KNOWLEDGE_BASE_IDS_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // Local storage can be unavailable in restricted browser modes; pane state still works in memory.
  }
}

function areSetsEqual(first, second) {
  if (first.size !== second.size) return false;
  return [...first].every((value) => second.has(value));
}

function isSettledJob(job) {
  return TERMINAL_JOB_STATUSES.has(job?.status) || TERMINAL_JOB_STATUSES.has(job?.stage);
}

export default function UploadBox({ projects = [] }) {
  const [documents, setDocuments] = useState([]);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(true);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [leftSearch, setLeftSearch] = useState('');
  const [debouncedLeftSearch, setDebouncedLeftSearch] = useState('');
  const [rightSearch, setRightSearch] = useState('');
  const [debouncedRightSearch, setDebouncedRightSearch] = useState('');
  const [leftSelection, setLeftSelection] = useState(() => new Set());
  const [knowledgeBaseIds, setKnowledgeBaseIds] = useState(readSavedKnowledgeBaseIds);
  const [rightSelection, setRightSelection] = useState(() => new Set());
  const [embeddingDocumentIds, setEmbeddingDocumentIds] = useState(() => new Set());
  const [jobProgress, setJobProgress] = useState({});
  const [uploadingFiles, setUploadingFiles] = useState([]);
  const [uploadProjectId, setUploadProjectId] = useState(null);
  const [batchProjectId, setBatchProjectId] = useState(null);
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
    const timeoutId = window.setTimeout(() => {
      setDebouncedRightSearch(rightSearch.trim().toLowerCase());
    }, 200);

    return () => window.clearTimeout(timeoutId);
  }, [rightSearch]);

  useEffect(() => {
    saveKnowledgeBaseIds(knowledgeBaseIds);
  }, [knowledgeBaseIds]);

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
          isSettledJob(latestByDocumentId[id])
        ));

        if (settledIds.length > 0) {
          setEmbeddingDocumentIds((currentIds) => {
            const nextIds = new Set(currentIds);
            settledIds.forEach((id) => nextIds.delete(id));
            return nextIds;
          });
        }

        if (settledIds.length > 0) {
          await refreshDocuments();
          setJobProgress((currentProgress) => {
            const nextProgress = { ...currentProgress };
            settledIds.forEach((id) => {
              delete nextProgress[id];
            });
            return nextProgress;
          });
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

  const projectById = useMemo(() => (
    new Map(projects.map((project) => [project.id, project]))
  ), [projects]);

  const documentViews = useMemo(() => (
    documents.map((document) => {
      const displayStatus = getDisplayStatus(document, embeddingDocumentIds, jobProgress);

      return {
        document,
        displayStatus,
        statusGroup: getStatusGroup(displayStatus),
        progress: jobProgress[document.id],
        project: document.projectId ? projectById.get(document.projectId) ?? null : null,
      };
    })
  ), [documents, embeddingDocumentIds, jobProgress, projectById]);

  useEffect(() => {
    const existingIds = new Set(documentViews.map((view) => view.document.id));
    const autoKnowledgeBaseIds = documentViews
      .filter(shouldAutoKeepInKnowledgeBase)
      .map((view) => view.document.id);
    const returnableIds = new Set(documentViews.filter(canReturnToAvailable).map((view) => view.document.id));

    setLeftSelection((currentIds) => (
      new Set([...currentIds].filter((id) => existingIds.has(id)))
    ));
    setKnowledgeBaseIds((currentIds) => {
      const nextIds = new Set([...currentIds].filter((id) => existingIds.has(id)));
      autoKnowledgeBaseIds.forEach((id) => nextIds.add(id));

      return areSetsEqual(currentIds, nextIds) ? currentIds : nextIds;
    });
    setRightSelection((currentIds) => (
      new Set([...currentIds].filter((id) => existingIds.has(id) && returnableIds.has(id)))
    ));
  }, [documentViews]);

  const leftViews = useMemo(() => (
    documentViews.filter((view) => !knowledgeBaseIds.has(view.document.id))
  ), [documentViews, knowledgeBaseIds]);

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
      .filter((view) => knowledgeBaseIds.has(view.document.id))
      .sort((a, b) => a.document.filename.localeCompare(b.document.filename))
  ), [documentViews, knowledgeBaseIds]);

  const visibleRightViews = useMemo(() => (
    rightViews.filter(({ document }) => (
      !debouncedRightSearch || document.filename.toLowerCase().includes(debouncedRightSearch)
    ))
  ), [debouncedRightSearch, rightViews]);

  const visibleEligibleLeftIds = useMemo(() => (
    visibleLeftViews.map((view) => view.document.id)
  ), [visibleLeftViews]);

  const selectedEligibleLeftIds = useMemo(() => (
    visibleEligibleLeftIds.filter((id) => leftSelection.has(id))
  ), [visibleEligibleLeftIds, leftSelection]);

  const visibleReturnableRightIds = useMemo(() => (
    visibleRightViews.filter(canReturnToAvailable).map((view) => view.document.id)
  ), [visibleRightViews]);

  const selectedReturnableRightIds = useMemo(() => (
    visibleReturnableRightIds.filter((id) => rightSelection.has(id))
  ), [visibleReturnableRightIds, rightSelection]);

  const selectedProjectAssignableIds = useMemo(() => (
    [...new Set([...leftSelection, ...rightSelection])].filter((id) => (
      documentViews.some((view) => view.document.id === id)
    ))
  ), [documentViews, leftSelection, rightSelection]);

  const allVisibleLeftSelected = visibleEligibleLeftIds.length > 0
    && visibleEligibleLeftIds.every((id) => leftSelection.has(id));
  const allVisibleRightSelected = visibleReturnableRightIds.length > 0
    && visibleReturnableRightIds.every((id) => rightSelection.has(id));

  const isEmbeddingAny = embeddingDocumentIds.size > 0;
  const embeddableKnowledgeViews = rightViews.filter((view) => (
    view.statusGroup === 'pending' || view.statusGroup === 'failed'
  ));

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
      const payload = await uploadFiles({ files: accepted, projectId: uploadProjectId });
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
  }, [documents, uploadProjectId, uploadingFiles]);

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
    setRightSelection((currentIds) => {
      const nextIds = new Set(currentIds);

      visibleReturnableRightIds.forEach((id) => {
        if (isSelected) {
          nextIds.add(id);
        } else {
          nextIds.delete(id);
        }
      });

      return nextIds;
    });
  }, [visibleReturnableRightIds]);

  const moveSelectedRight = useCallback(() => {
    if (selectedEligibleLeftIds.length === 0) {
      return;
    }

    setKnowledgeBaseIds((currentIds) => new Set([...currentIds, ...selectedEligibleLeftIds]));
    setLeftSelection((currentIds) => {
      const nextIds = new Set(currentIds);
      selectedEligibleLeftIds.forEach((id) => nextIds.delete(id));
      return nextIds;
    });
  }, [selectedEligibleLeftIds]);

  const moveSelectedLeft = useCallback(() => {
    if (selectedReturnableRightIds.length === 0) {
      return;
    }

    setKnowledgeBaseIds((currentIds) => {
      const nextIds = new Set(currentIds);
      selectedReturnableRightIds.forEach((id) => nextIds.delete(id));
      return nextIds;
    });
    setRightSelection(new Set());
  }, [selectedReturnableRightIds]);

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
      setKnowledgeBaseIds((currentIds) => {
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

  const assignDocumentProject = useCallback(async (document, projectId) => {
    setErrorMessage('');

    try {
      const payload = await updateDocumentProject(document.id, projectId);
      const updatedDocument = payload.document;

      if (updatedDocument) {
        setDocuments((currentDocuments) => (
          currentDocuments.map((currentDocument) => (
            currentDocument.id === updatedDocument.id ? updatedDocument : currentDocument
          ))
        ));
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update project.');
    }
  }, []);

  const assignSelectedProject = useCallback(async () => {
    if (selectedProjectAssignableIds.length === 0) {
      return;
    }

    setErrorMessage('');

    try {
      const updates = await Promise.all(
        selectedProjectAssignableIds.map((documentId) => (
          updateDocumentProject(documentId, batchProjectId)
        )),
      );
      const updatedById = new Map(
        updates
          .map((payload) => payload.document)
          .filter(Boolean)
          .map((document) => [document.id, document]),
      );

      setDocuments((currentDocuments) => (
        currentDocuments.map((document) => updatedById.get(document.id) ?? document)
      ));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update selected projects.');
    }
  }, [batchProjectId, selectedProjectAssignableIds]);

  const embedDocuments = useCallback(async (documentsToEmbed) => {
    const documentIds = documentsToEmbed.map((document) => document.id);

    if (documentIds.length === 0) {
      return;
    }

    setErrorMessage('');
    setEmbeddingDocumentIds((currentIds) => new Set([...currentIds, ...documentIds]));
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
  }, [refreshDocuments]);

  const embedPendingAndFailed = useCallback(() => {
    embedDocuments(embeddableKnowledgeViews.map((view) => view.document));
  }, [embedDocuments, embeddableKnowledgeViews]);

  const embedSingleDocument = useCallback((document) => {
    embedDocuments([document]);
  }, [embedDocuments]);

  const clearFailedDocuments = useCallback(() => {
    const failedIds = rightViews
      .filter((view) => view.statusGroup === 'failed')
      .map((view) => view.document.id);

    if (failedIds.length === 0) {
      return;
    }

    setKnowledgeBaseIds((currentIds) => {
      const nextIds = new Set(currentIds);
      failedIds.forEach((id) => nextIds.delete(id));
      return nextIds;
    });
    setRightSelection((currentIds) => {
      const nextIds = new Set(currentIds);
      failedIds.forEach((id) => nextIds.delete(id));
      return nextIds;
    });
  }, [rightViews]);

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

        <div className="upload-project-toolbar">
          <ProjectSelector
            projects={projects}
            value={uploadProjectId}
            label="New uploads"
            emptyLabel="No project"
            onChange={setUploadProjectId}
          />
        </div>

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
            searchPlaceholder="Search available files..."
            selectedIds={leftSelection}
            allSelectableSelected={allVisibleLeftSelected}
            selectableCount={visibleEligibleLeftIds.length}
            onSelectAll={toggleVisibleLeftSelection}
            onSelectFile={selectLeftFile}
            onRemoveFile={removeDocument}
            projects={projects}
            onProjectChange={assignDocumentProject}
            emptyTitle={documents.length === 0 ? 'Upload files to build your pool' : 'No files match this search'}
            emptyBody={documents.length === 0
              ? 'Files stay here until you move them into the knowledge base.'
              : 'Clear or change the search filter to see more files.'}
          />

          <TransferControls
            canMoveSelectedRight={selectedEligibleLeftIds.length > 0}
            canMoveSelectedLeft={selectedReturnableRightIds.length > 0}
            onMoveSelectedRight={moveSelectedRight}
            onMoveSelectedLeft={moveSelectedLeft}
          />

          <TransferPane
            title="Knowledge Base"
            count={rightViews.length}
            variant="knowledge"
            views={visibleRightViews}
            searchValue={rightSearch}
            onSearchChange={setRightSearch}
            searchPlaceholder="Search knowledge base..."
            selectedIds={rightSelection}
            allSelectableSelected={allVisibleRightSelected}
            selectableCount={visibleReturnableRightIds.length}
            onSelectAll={toggleRightSelection}
            onSelectFile={selectRightFile}
            onRemoveFile={removeDocument}
            onEmbedFile={embedSingleDocument}
            isActionDisabled={isEmbeddingAny}
            projects={projects}
            onProjectChange={assignDocumentProject}
            emptyTitle={rightViews.length === 0 ? 'Knowledge base is empty' : 'No knowledge base files match this search'}
            emptyBody={rightViews.length === 0
              ? 'Move available files here to queue them for embedding.'
              : 'Clear or change the search filter to see more files.'}
          />
        </section>

        {selectedProjectAssignableIds.length > 0 && (
          <div className="project-assignment-bar">
            <span>{selectedProjectAssignableIds.length} selected</span>
            <ProjectSelector
              projects={projects}
              value={batchProjectId}
              label="Set project"
              emptyLabel="No project"
              onChange={setBatchProjectId}
            />
            <button type="button" onClick={assignSelectedProject}>
              Apply
            </button>
          </div>
        )}

        <EmbedActionBar
          views={rightViews}
          isEmbedding={isEmbeddingAny}
          onEmbed={embedPendingAndFailed}
          onClearFailed={clearFailedDocuments}
        />
      </div>
    </div>
  );
}
