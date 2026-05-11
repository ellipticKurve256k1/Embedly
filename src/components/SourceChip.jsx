import { useId, useRef, useState } from 'react';
import SourcePopover from './SourcePopover.jsx';
import './SourceChip.css';

function formatScore(score) {
  if (typeof score !== 'number') return '';
  return `${Math.round(score * 100)}% match`;
}

function scoreTone(score) {
  if (typeof score !== 'number') return 'unknown';
  if (score >= 0.82) return 'high';
  if (score >= 0.68) return 'medium';
  return 'low';
}

export default function SourceChip({ number, chunk, isCited = false, score }) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);
  const tooltipId = useId();

  if (!chunk) {
    return <span className="source-chip__fallback">[{number}]</span>;
  }

  const documentName = chunk.documentName || 'Untitled document';
  const scoreLabel = formatScore(score);
  const tone = scoreTone(score);

  const closeOnBlur = (event) => {
    if (!wrapperRef.current?.contains(event.relatedTarget)) {
      setIsOpen(false);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      setIsOpen(false);
      event.currentTarget.blur();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setIsOpen((current) => !current);
    }
  };

  return (
    <span
      className="source-chip"
      ref={wrapperRef}
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
      onFocus={() => setIsOpen(true)}
      onBlur={closeOnBlur}
    >
      <button
        className={[
          'source-chip__badge',
          `source-chip__badge--${tone}`,
          isCited ? 'is-cited' : 'is-uncited',
          isOpen ? 'is-open' : '',
        ].filter(Boolean).join(' ')}
        type="button"
        aria-label={[
          `Source ${number}: ${documentName}`,
          scoreLabel,
          isCited ? 'cited in this answer' : 'retrieved source',
        ].filter(Boolean).join(', ')}
        aria-describedby={isOpen ? tooltipId : undefined}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
        onKeyDown={handleKeyDown}
      >
        [{number}]
      </button>
      {isOpen && (
        <SourcePopover
          id={tooltipId}
          number={number}
          chunk={chunk}
          score={score}
          isCited={isCited}
        />
      )}
    </span>
  );
}
