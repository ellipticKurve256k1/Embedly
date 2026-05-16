import { FolderKanban } from 'lucide-react';
import './ProjectSelector.css';

export default function ProjectSelector({
  projects = [],
  value = '',
  onChange,
  label = 'Project',
  emptyLabel = 'All Documents',
  disabled = false,
  className = '',
}) {
  return (
    <label className={`project-selector${className ? ` ${className}` : ''}`}>
      <span className="project-selector__label">
        <FolderKanban size={14} />
        <span>{label}</span>
      </span>
      <select
        value={value ?? ''}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.value || null)}
      >
        <option value="">{emptyLabel}</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>
    </label>
  );
}
