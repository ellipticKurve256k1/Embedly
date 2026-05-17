import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, FolderKanban, Globe2 } from 'lucide-react';
import ProjectChip from './ProjectChip.jsx';
import './ScopeToggle.css';

export const UNASSIGNED_SCOPE_VALUE = '__unassigned__';

export default function ScopeToggle({
  projects = [],
  value = null,
  onChange,
  allLabel = 'All Documents',
  unassignedLabel = 'No project',
  showUnassignedOption = false,
  variant = 'compact',
  align = 'right',
  emphasis = 'strong',
  showPrefix,
  className = '',
  disabled = false,
  showHelper = true,
  flashKey,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const controlRef = useRef(null);
  const selectedProject = projects.find((project) => project.id === value) ?? null;
  const selectedValue = value ?? '';
  const isUnassignedScope = showUnassignedOption && value === UNASSIGNED_SCOPE_VALUE;
  const scopeLabel = isUnassignedScope ? unassignedLabel : selectedProject?.name ?? allLabel;
  const shouldShowPrefix = showPrefix ?? variant !== 'micro';
  const sortedProjects = useMemo(() => (
    [...projects].sort((a, b) => (
      Number(b.documentCount ?? 0) - Number(a.documentCount ?? 0)
        || String(a.name ?? '').localeCompare(String(b.name ?? ''))
    ))
  ), [projects]);

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

  const focusMenuItem = (targetIndex) => {
    window.requestAnimationFrame(() => {
      const menuItems = controlRef.current?.querySelectorAll(
        '.scope-toggle__item, .scope-toggle__manage',
      );
      if (!menuItems?.length) return;

      const boundedIndex = Math.max(0, Math.min(targetIndex, menuItems.length - 1));
      menuItems[boundedIndex]?.focus();
    });
  };

  const handleTriggerKeyDown = (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;

    event.preventDefault();
    setIsOpen(true);
    focusMenuItem(event.key === 'ArrowUp' ? Number.MAX_SAFE_INTEGER : 0);
  };

  const handleMenuKeyDown = (event) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;

    const menuItems = [...controlRef.current?.querySelectorAll(
      '.scope-toggle__item, .scope-toggle__manage',
    ) ?? []];
    if (menuItems.length === 0) return;

    event.preventDefault();
    const currentIndex = menuItems.indexOf(document.activeElement);
    const lastIndex = menuItems.length - 1;

    if (event.key === 'Home') {
      menuItems[0]?.focus();
      return;
    }

    if (event.key === 'End') {
      menuItems[lastIndex]?.focus();
      return;
    }

    const nextIndex = event.key === 'ArrowDown'
      ? currentIndex >= lastIndex ? 0 : currentIndex + 1
      : currentIndex <= 0 ? lastIndex : currentIndex - 1;
    menuItems[nextIndex]?.focus();
  };

  return (
    <div
      className={[
        'scope-toggle',
        `scope-toggle--${variant}`,
        `scope-toggle--align-${align}`,
        `scope-toggle--${emphasis}`,
        selectedProject ? 'is-scoped' : isUnassignedScope ? 'is-unassigned' : 'is-all',
        isOpen ? 'is-open' : '',
        disabled ? 'is-disabled' : '',
        flashKey ? 'has-flash' : '',
        className,
      ].filter(Boolean).join(' ')}
      ref={controlRef}
      data-flash-key={flashKey ?? undefined}
    >
      <button
        className="scope-toggle__trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`Current dataset: ${scopeLabel}. Open to change.`}
        title={scopeLabel}
        disabled={disabled}
        onClick={() => setIsOpen((current) => !current)}
        onKeyDown={handleTriggerKeyDown}
      >
        {selectedProject ? (
          <ProjectChip project={selectedProject} variant="micro" />
        ) : isUnassignedScope ? (
          <ProjectChip label={unassignedLabel} state="unassigned" variant="micro" />
        ) : (
          <span className="scope-toggle__all-icon" aria-hidden="true">
            <Globe2 size={14} />
          </span>
        )}
        {variant !== 'micro' && (
          <span className="scope-toggle__text">
            {shouldShowPrefix && (
              <span className="scope-toggle__prefix">Scope</span>
            )}
            <span className="scope-toggle__label">{scopeLabel}</span>
          </span>
        )}
        <ChevronDown className="scope-toggle__chevron" size={14} />
      </button>

      {isOpen && (
        <div
          className="scope-toggle__menu"
          role="listbox"
          aria-label="Dataset scope"
          onKeyDown={handleMenuKeyDown}
        >
          <button
            className={`scope-toggle__item${selectedValue === '' ? ' is-active' : ''}`}
            type="button"
            role="option"
            aria-selected={selectedValue === ''}
            onClick={() => selectProject(null)}
          >
            <span className="scope-toggle__neutral-icon" aria-hidden="true">
              <Globe2 size={16} />
            </span>
            <ProjectChip
              label={allLabel}
              variant="compact"
            />
          </button>

          {sortedProjects.length > 0 && <span className="scope-toggle__separator" />}

          {sortedProjects.map((project) => (
            <button
              className={`scope-toggle__item${selectedValue === project.id ? ' is-active' : ''}`}
              type="button"
              role="option"
              aria-selected={selectedValue === project.id}
              key={project.id}
              onClick={() => selectProject(project.id)}
            >
              <span className="scope-toggle__neutral-icon" aria-hidden="true">
                <FolderKanban size={16} />
              </span>
              <ProjectChip project={project} variant="compact" showCount />
            </button>
          ))}

          {showUnassignedOption && (
            <>
              {sortedProjects.length > 0 && <span className="scope-toggle__separator" />}
              <button
                className={`scope-toggle__item${selectedValue === UNASSIGNED_SCOPE_VALUE ? ' is-active' : ''}`}
                type="button"
                role="option"
                aria-selected={selectedValue === UNASSIGNED_SCOPE_VALUE}
                onClick={() => selectProject(UNASSIGNED_SCOPE_VALUE)}
              >
                <span className="scope-toggle__neutral-icon is-unassigned" aria-hidden="true">!</span>
                <ProjectChip
                  label={unassignedLabel}
                  state="unassigned"
                  variant="compact"
                />
              </button>
            </>
          )}

          {sortedProjects.length === 0 && showHelper && (
            <p className="scope-toggle__helper">
              Create projects in Settings to scope retrieval.
            </p>
          )}

          <a className="scope-toggle__manage" href="#settings">
            Manage projects...
          </a>
        </div>
      )}
    </div>
  );
}
