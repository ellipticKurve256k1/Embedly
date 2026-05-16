import './ProjectChip.css';

const PROJECT_TONES = [
  { accent: '#6258ff', soft: 'rgba(98, 88, 255, 0.13)', border: 'rgba(98, 88, 255, 0.28)' },
  { accent: '#27745b', soft: 'rgba(39, 116, 91, 0.13)', border: 'rgba(39, 116, 91, 0.26)' },
  { accent: '#8a5c16', soft: 'rgba(138, 92, 22, 0.13)', border: 'rgba(138, 92, 22, 0.25)' },
  { accent: '#9f4452', soft: 'rgba(159, 68, 82, 0.12)', border: 'rgba(159, 68, 82, 0.24)' },
  { accent: '#6f7a94', soft: 'rgba(111, 122, 148, 0.13)', border: 'rgba(111, 122, 148, 0.25)' },
];

function hashString(value) {
  return Array.from(String(value ?? '')).reduce((hash, character) => (
    ((hash << 5) - hash) + character.charCodeAt(0)
  ), 0);
}

function getProjectTone(project) {
  if (!project) {
    return null;
  }

  const hash = Math.abs(hashString(project.name || project.id));
  return PROJECT_TONES[hash % PROJECT_TONES.length];
}

function getInitials(value, fallback = 'PR') {
  const words = String(value ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return fallback;
  }

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

export default function ProjectChip({
  project = null,
  label,
  documentCount,
  variant = 'default',
  state,
  showCount = false,
  ariaLabel,
  className = '',
}) {
  const chipState = state ?? (project ? 'project' : 'all');
  const chipLabel = chipState === 'unassigned'
    ? label ?? 'No project'
    : project?.name ?? label ?? 'All Documents';
  const tone = getProjectTone(project);
  const style = tone
    ? {
      '--project-accent': tone.accent,
      '--project-soft': tone.soft,
      '--project-border': tone.border,
    }
    : undefined;
  const initials = project
    ? getInitials(project.name)
    : chipState === 'unassigned'
      ? '!'
      : 'ALL';
  const count = documentCount ?? project?.documentCount;
  const normalizedCount = Number(count);
  const hasCount = Number.isFinite(normalizedCount);
  const computedAriaLabel = ariaLabel
    ?? `${chipState === 'all' ? 'Dataset' : 'Project'}: ${chipLabel}${showCount && hasCount ? `, ${normalizedCount} document${normalizedCount === 1 ? '' : 's'}` : ''}`;

  return (
    <span
      className={`project-chip is-${variant} is-${chipState}${className ? ` ${className}` : ''}`}
      style={style}
      role="img"
      aria-label={computedAriaLabel}
      title={chipLabel}
    >
      <span className="project-chip__mark" aria-hidden="true">{initials}</span>
      <span className="project-chip__text">
        <strong>{chipLabel}</strong>
        {showCount && hasCount && (
          <small>{normalizedCount} document{normalizedCount === 1 ? '' : 's'}</small>
        )}
      </span>
    </span>
  );
}

export function getProjectInitials(projectOrName, fallback = 'PR') {
  return getInitials(typeof projectOrName === 'string' ? projectOrName : projectOrName?.name, fallback);
}
