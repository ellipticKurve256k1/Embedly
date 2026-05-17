import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  deleteDocument,
  getDocuments,
  getJobs,
  startEmbedding,
  updateDocumentProject,
  uploadFiles,
} from '../lib/api.js';
import { useEmbedding } from '../lib/embeddingContext.jsx';
import EmbedActionBar from './EmbedActionBar.jsx';
import FileDropZone from './FileDropZone.jsx';
import ProjectChip from './ProjectChip.jsx';
import ProjectSelector from './ProjectSelector.jsx';
import ScopeToggle, { UNASSIGNED_SCOPE_VALUE } from './ScopeToggle.jsx';
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
const UNASSIGNED_PROJECT_SCOPE = UNASSIGNED_SCOPE_VALUE;

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

function isDocumentInProjectScope(document, projectScopeId) {
  if (!projectScopeId) return true;
  if (projectScopeId === UNASSIGNED_PROJECT_SCOPE) return !document.projectId;
  return document.projectId === projectScopeId;
}

export default function UploadBox({ projects = [] }) {
  const { activeJobs, recentJobs, isStreaming: isEmbeddingStreamConnected } = useEmbedding();
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
  const [scopeProjectId, setScopeProjectId] = useState(null);
  const [scopeFlashKey, setScopeFlashKey] = useState(null);
  const [batchProjectId, setBatchProjectId] = useState(null);
  const [assignmentNotice, setAssignmentNotice] = useState('');
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
    if (isEmbeddingStreamConnected) {
      return undefined;
    }

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
  }, [documents, embeddingDocumentIds, isEmbeddingStreamConnected, refreshDocuments]);

  useEffect(() => {
    const nextProgressByDocumentId = {};
    const nextActiveDocumentIds = new Set();

    activeJobs.forEach((job) => {
      if (!job.documentId) return;
      nextProgressByDocumentId[job.documentId] = job;
      nextActiveDocumentIds.add(job.documentId);
    });

    if (nextActiveDocumentIds.size > 0) {
      setEmbeddingDocumentIds((currentIds) => new Set([...currentIds, ...nextActiveDocumentIds]));
      setJobProgress((currentProgress) => ({
        ...currentProgress,
        ...nextProgressByDocumentId,
      }));
    }
  }, [activeJobs]);

  useEffect(() => {
    const settledDocumentIds = recentJobs
      .map((job) => job.documentId)
      .filter(Boolean);

    if (settledDocumentIds.length === 0) {
      return;
    }

    setEmbeddingDocumentIds((currentIds) => {
      const nextIds = new Set(currentIds);
      settledDocumentIds.forEach((id) => nextIds.delete(id));
      return nextIds;
    });
    setJobProgress((currentProgress) => {
      const nextProgress = { ...currentProgress };
      settledDocumentIds.forEach((id) => {
        delete nextProgress[id];
      });
      return nextProgress;
    });
    refreshDocuments().catch(() => {});
  }, [recentJobs, refreshDocuments]);

  const projectById = useMemo(() => (
    new Map(projects.map((project) => [project.id, project]))
  ), [projects]);
  const uploadProject = uploadProjectId ? projectById.get(uploadProjectId) ?? null : null;
  const scopedProject = scopeProjectId && scopeProjectId !== UNASSIGNED_PROJECT_SCOPE
    ? projectById.get(scopeProjectId) ?? null
    : null;
  const scopeName = scopeProjectId === UNASSIGNED_PROJECT_SCOPE
    ? 'No project'
    : scopedProject?.name ?? 'All Documents';
  const batchProject = batchProjectId ? projectById.get(batchProjectId) ?? null : null;
  const quickUploadProjects = useMemo(() => (
    [...projects]
      .sort((a, b) => Number(b.documentCount ?? 0) - Number(a.documentCount ?? 0))
      .slice(0, 3)
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

  const projectSummary = useMemo(() => {
    const countsByProjectId = new Map(projects.map((project) => [project.id, 0]));
    let unassignedCount = 0;

    documents.forEach((document) => {
      if (document.projectId && countsByProjectId.has(document.projectId)) {
        countsByProjectId.set(document.projectId, countsByProjectId.get(document.projectId) + 1);
      } else {
        unassignedCount += 1;
      }
    });

    return {
      totalCount: documents.length,
      unassignedCount,
      projectCounts: projects.map((project) => ({
        ...project,
        documentCount: countsByProjectId.get(project.id) ?? 0,
      })),
    };
  }, [documents, projects]);

  useEffect(() => {
    if (
      scopeProjectId
      && scopeProjectId !== UNASSIGNED_PROJECT_SCOPE
      && !projectById.has(scopeProjectId)
    ) {
      setScopeProjectId(null);
    }
  }, [projectById, scopeProjectId]);

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

  const scopedDocumentViews = useMemo(() => (
    documentViews.filter((view) => isDocumentInProjectScope(view.document, scopeProjectId))
  ), [documentViews, scopeProjectId]);

  useEffect(() => {
    const visibleScopedIds = new Set(scopedDocumentViews.map((view) => view.document.id));

    setLeftSelection((currentIds) => (
      new Set([...currentIds].filter((id) => visibleScopedIds.has(id)))
    ));
    setRightSelection((currentIds) => (
      new Set([...currentIds].filter((id) => visibleScopedIds.has(id)))
    ));
  }, [scopedDocumentViews]);

  const allLeftViews = useMemo(() => (
    documentViews.filter((view) => !knowledgeBaseIds.has(view.document.id))
  ), [documentViews, knowledgeBaseIds]);

  const leftViews = useMemo(() => (
    scopedDocumentViews.filter((view) => !knowledgeBaseIds.has(view.document.id))
  ), [knowledgeBaseIds, scopedDocumentViews]);

  const visibleUploadingFiles = useMemo(() => (
    uploadingFiles.filter(() => (
      !scopeProjectId
      || (scopeProjectId === UNASSIGNED_PROJECT_SCOPE && !uploadProjectId)
      || scopeProjectId === uploadProjectId
    ))
  ), [scopeProjectId, uploadProjectId, uploadingFiles]);

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

  const allRightViews = useMemo(() => (
    documentViews
      .filter((view) => knowledgeBaseIds.has(view.document.id))
      .sort((a, b) => a.document.filename.localeCompare(b.document.filename))
  ), [documentViews, knowledgeBaseIds]);

  const rightViews = useMemo(() => (
    scopedDocumentViews
      .filter((view) => knowledgeBaseIds.has(view.document.id))
      .sort((a, b) => a.document.filename.localeCompare(b.document.filename))
  ), [knowledgeBaseIds, scopedDocumentViews]);

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

  const isProjectScoped = Boolean(scopeProjectId);
  const filteredDocumentCount = scopedDocumentViews.length;
  const scopeContextLabel = isProjectScoped
    ? `Viewing ${filteredDocumentCount} of ${documents.length} document${documents.length === 1 ? '' : 's'} in ${scopeName}`
    : `${documents.length} document${documents.length === 1 ? '' : 's'} across all projects`;

  const handleScopeProjectChange = useCallback((projectId) => {
    setScopeProjectId(projectId);
    setLeftSelection(new Set());
    setRightSelection(new Set());
    const nextFlashKey = `${projectId ?? 'all'}-${Date.now()}`;
    setScopeFlashKey(nextFlashKey);
    window.setTimeout(() => {
      setScopeFlashKey((currentKey) => (currentKey === nextFlashKey ? null : currentKey));
    }, 700);

    if (projectId === UNASSIGNED_PROJECT_SCOPE) {
      setUploadProjectId(null);
    } else if (projectId) {
      setUploadProjectId(projectId);
    }
  }, []);

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
      setLeftSelection(new Set());
      setRightSelection(new Set());

      const targetName = batchProject?.name ?? 'No project';
      setAssignmentNotice(`Assigned to ${targetName}.`);
      window.setTimeout(() => {
        setAssignmentNotice('');
      }, 1500);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update selected projects.');
    }
  }, [batchProject, batchProjectId, selectedProjectAssignableIds]);

  const embedDocuments = useCallback(async (documentsToEmbed) => {
    const documentIds = documentsToEmbed.map((document) => document.id);

    if (documentIds.length === 0) {
      return;
    }

    setErrorMessage('');
    setEmbeddingDocumentIds((currentIds) => new Set([...currentIds, ...documentIds]));
    setRightSelection(new Set());

    try {
      const payload = await startEmbedding(documentIds);
      const queuedJobs = payload.jobs ?? [];

      if (queuedJobs.length > 0) {
        setJobProgress((currentProgress) => {
          const nextProgress = { ...currentProgress };
          queuedJobs.forEach((job) => {
            if (job.documentId) {
              nextProgress[job.documentId] = job;
            }
          });
          return nextProgress;
        });
      }

      await refreshDocuments();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Embedding failed.');
      setEmbeddingDocumentIds((currentIds) => {
        const nextIds = new Set(currentIds);
        documentIds.forEach((id) => nextIds.delete(id));
        return nextIds;
      });
      await refreshDocuments().catch(() => {});
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
        <div className="upload-preassign-strip" aria-label="Project for new uploads">
          <span>Assign new uploads</span>
          <div className="upload-preassign-options">
            <button
              className={!uploadProjectId ? 'is-active' : ''}
              type="button"
              onClick={() => setUploadProjectId(null)}
            >
              <ProjectChip label="No project" state="unassigned" variant="compact" />
            </button>
            {quickUploadProjects.map((project) => (
              <button
                className={uploadProjectId === project.id ? 'is-active' : ''}
                type="button"
                key={project.id}
                onClick={() => setUploadProjectId(project.id)}
              >
                <ProjectChip project={project} variant="compact" />
              </button>
            ))}
          </div>
        </div>

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
          <span className="upload-project-toolbar__current">
            New files:
            <ProjectChip
              project={uploadProject}
              label={uploadProject?.name ?? 'No project'}
              state={uploadProject ? 'project' : 'unassigned'}
              variant="compact"
            />
          </span>
          <ProjectSelector
            projects={projects}
            value={uploadProjectId}
            label="New uploads"
            emptyLabel="No project"
            onChange={setUploadProjectId}
          />
        </div>

        <div className="upload-scope-panel" aria-label="Upload project scope">
          <div className="upload-scope-control">
            <div className="upload-scope-control__copy">
              <span>Viewing</span>
              <strong>{scopeContextLabel}</strong>
            </div>
            <ScopeToggle
              projects={projects}
              value={scopeProjectId}
              showUnassignedOption
              flashKey={scopeFlashKey}
              onChange={handleScopeProjectChange}
            />
            {isProjectScoped && (
              <button
                className="upload-scope-control__clear"
                type="button"
                onClick={() => handleScopeProjectChange(null)}
              >
                Clear filter
              </button>
            )}
          </div>

          <div className="upload-project-summary" aria-label="Project document summary">
            <span className="upload-project-summary__label">Projects</span>
            <button
              className={`upload-project-summary__chip${!scopeProjectId ? ' is-active' : ''}`}
              type="button"
              aria-pressed={!scopeProjectId}
              onClick={() => handleScopeProjectChange(null)}
            >
              <ProjectChip
                label="All Documents"
                documentCount={projectSummary.totalCount}
                variant="compact"
                showCount
              />
            </button>
            {projectSummary.projectCounts.map((project) => (
              <button
                className={`upload-project-summary__chip${scopeProjectId === project.id ? ' is-active' : ''}`}
                type="button"
                aria-pressed={scopeProjectId === project.id}
                key={project.id}
                onClick={() => handleScopeProjectChange(project.id)}
              >
                <ProjectChip
                  project={project}
                  documentCount={project.documentCount}
                  variant="compact"
                  showCount
                />
              </button>
            ))}
            <button
              className={`upload-project-summary__chip${scopeProjectId === UNASSIGNED_PROJECT_SCOPE ? ' is-active' : ''}`}
              type="button"
              aria-pressed={scopeProjectId === UNASSIGNED_PROJECT_SCOPE}
              onClick={() => handleScopeProjectChange(UNASSIGNED_PROJECT_SCOPE)}
            >
              <ProjectChip
                label="No project"
                documentCount={projectSummary.unassignedCount}
                state="unassigned"
                variant="compact"
                showCount
                className={projectSummary.unassignedCount > 0 ? 'has-unassigned-count' : ''}
              />
            </button>
          </div>
        </div>

        {errorMessage && (
          <div className="upload-message is-error" role="alert">
            {errorMessage}
          </div>
        )}

        <section className="transfer-workspace" aria-label="Upload selection workspace">
          <TransferPane
            title="Available Files"
            count={leftViews.length + visibleUploadingFiles.length}
            totalCount={isProjectScoped ? allLeftViews.length + uploadingFiles.length : null}
            projectScopeName={isProjectScoped ? scopeName : ''}
            variant="available"
            views={visibleLeftViews}
            uploadingFiles={visibleUploadingFiles}
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
            projectScopeId={scopeProjectId}
            onProjectChange={assignDocumentProject}
            emptyTitle={documents.length === 0
              ? 'Upload files to build your pool'
              : isProjectScoped && scopedDocumentViews.length === 0
                ? `No documents in ${scopeName}`
                : leftViews.length === 0 && isProjectScoped
                  ? `No available files in ${scopeName}`
                  : 'No files match this search'}
            emptyBody={documents.length === 0
              ? 'Files stay here until you move them into the knowledge base.'
              : isProjectScoped && scopedDocumentViews.length === 0
                ? `Use the drop zone to upload files${scopeProjectId && scopeProjectId !== UNASSIGNED_PROJECT_SCOPE ? ` to ${scopeName}` : ''}, or clear the filter to see all documents.`
                : leftViews.length === 0 && isProjectScoped
                  ? 'Files in this scope are already in the knowledge base, or clear the filter to see more files.'
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
            totalCount={isProjectScoped ? allRightViews.length : null}
            projectScopeName={isProjectScoped ? scopeName : ''}
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
            projectScopeId={scopeProjectId}
            onProjectChange={assignDocumentProject}
            emptyTitle={rightViews.length === 0
              ? isProjectScoped ? `No knowledge base files in ${scopeName}` : 'Knowledge base is empty'
              : 'No knowledge base files match this search'}
            emptyBody={rightViews.length === 0
              ? isProjectScoped
                ? 'Move files from this scoped available list, or clear the filter to see the full knowledge base.'
                : 'Move available files here to queue them for embedding.'
              : 'Clear or change the search filter to see more files.'}
          />
        </section>

        {assignmentNotice && (
          <div className="upload-message is-success" role="status">
            {assignmentNotice}
          </div>
        )}

        {selectedProjectAssignableIds.length > 0 && (
          <div className="project-assignment-bar">
            <div className="project-assignment-bar__summary">
              <strong>
                {selectedProjectAssignableIds.length} file{selectedProjectAssignableIds.length === 1 ? '' : 's'} selected
              </strong>
              <span>Assign to project</span>
            </div>
            <div className="project-assignment-bar__target">
              <span>Assign to:</span>
              <ProjectChip
                project={batchProject}
                label={batchProject?.name ?? 'No project'}
                state={batchProject ? 'project' : 'unassigned'}
                variant="compact"
              />
            </div>
            <ProjectSelector
              projects={projects}
              value={batchProjectId}
              label="Target"
              emptyLabel="No project"
              onChange={setBatchProjectId}
            />
            <button type="button" onClick={assignSelectedProject}>
              Apply
            </button>
            <button
              className="project-assignment-bar__clear"
              type="button"
              onClick={() => {
                setLeftSelection(new Set());
                setRightSelection(new Set());
              }}
            >
              Clear selection
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
