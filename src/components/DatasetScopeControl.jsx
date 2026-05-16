import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, FolderKanban, Globe2, Search } from 'lucide-react';
import ProjectChip from './ProjectChip.jsx';
import './DatasetScopeControl.css';

function getDocumentCountLabel(count) {
  const normalizedCount = Number(count);

  if (!Number.isFinite(normalizedCount)) {
    return 'All documents in scope';
  }

  return `${normalizedCount} document${normalizedCount === 1 ? '' : 's'} in scope`;
}

export default function DatasetScopeControl({
  projects = [],
  value = null,
  onChange,
  label = 'Dataset Scope',
  contextLabel = 'Retrieving from',
  allLabel = 'All Documents',
  className = '',
  disabled = false,
  showHelper = true,
  isLoading = false,
  flashKey,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const controlRef = useRef(null);
  const selectedProject = projects.find((project) => project.id === value) ?? null;
  const sortedProjects = useMemo(() => (
    [...projects].sort((a, b) => (
      Number(b.documentCount ?? 0) - Number(a.documentCount ?? 0)
        || String(a.name ?? '').localeCompare(String(b.name ?? ''))
    ))
  ), [projects]);
  const activeCount = selectedProject?.documentCount;
  const selectedValue = value ?? '';

  useEffect(() => {
    if (!isOpen) return undefined;

    const handlePointerDown = (event) => {
      if (!controlRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const selectProject = (nextProjectId) => {
    setIsOpen(false);
    onChange?.(nextProjectId || null);
  };

  return (
    <div
      className={[
        'dataset-scope-control',
        selectedProject ? 'is-scoped' : 'is-all',
        isOpen ? 'is-open' : '',
        disabled ? 'is-disabled' : '',
        flashKey ? 'has-flash' : '',
        className,
      ].filter(Boolean).join(' ')}
      ref={controlRef}
      data-flash-key={flashKey ?? undefined}
    >
      <span className="dataset-scope-control__label">{label}</span>

      <button
        className="dataset-scope-control__trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className="dataset-scope-control__prefix">
          <Search size={16} />
          <span>{contextLabel}:</span>
        </span>
        <span className="dataset-scope-control__value">
          {selectedProject ? (
            <ProjectChip
              project={selectedProject}
              variant="scope"
              showCount
            />
          ) : (
            <ProjectChip
              label={allLabel}
              variant="scope"
            />
          )}
        </span>
        <span className="dataset-scope-control__count">
          {isLoading ? 'Switching...' : getDocumentCountLabel(activeCount)}
        </span>
        <ChevronDown className="dataset-scope-control__chevron" size={16} />
      </button>

      {isOpen && (
        <div className="dataset-scope-control__menu" role="listbox" aria-label={label}>
          <button
            className={`dataset-scope-control__item${selectedValue === '' ? ' is-active' : ''}`}
            type="button"
            role="option"
            aria-selected={selectedValue === ''}
            onClick={() => selectProject(null)}
          >
            <span className="dataset-scope-control__neutral-icon" aria-hidden="true">
              <Globe2 size={16} />
            </span>
            <ProjectChip
              label={allLabel}
              variant="compact"
            />
          </button>

          {sortedProjects.length > 0 && <span className="dataset-scope-control__separator" />}

          {sortedProjects.map((project) => (
            <button
              className={`dataset-scope-control__item${selectedValue === project.id ? ' is-active' : ''}`}
              type="button"
              role="option"
              aria-selected={selectedValue === project.id}
              key={project.id}
              onClick={() => selectProject(project.id)}
            >
              <span className="dataset-scope-control__neutral-icon" aria-hidden="true">
                <FolderKanban size={16} />
              </span>
              <ProjectChip project={project} variant="compact" showCount />
            </button>
          ))}

          {sortedProjects.length === 0 && showHelper && (
            <p className="dataset-scope-control__helper">
              Create projects in Settings to scope retrieval.
            </p>
          )}

          <a className="dataset-scope-control__manage" href="#settings">
            Manage projects...
          </a>
        </div>
      )}
    </div>
  );
}
