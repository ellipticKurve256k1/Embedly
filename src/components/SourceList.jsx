import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import SourceItem from './SourceItem.jsx';
import './SourceList.css';

const INITIAL_VISIBLE_SOURCES = 5;

export default function SourceList({ chunks = [], citedIndices = [] }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const citedSet = useMemo(() => new Set(citedIndices), [citedIndices]);

  if (!Array.isArray(chunks) || chunks.length === 0) {
    return null;
  }

  const citedCount = chunks.filter((_chunk, index) => citedSet.has(index)).length;
  const visibleChunks = showAll ? chunks : chunks.slice(0, INITIAL_VISIBLE_SOURCES);
  const hiddenCount = Math.max(0, chunks.length - visibleChunks.length);

  return (
    <div className={`source-list${isExpanded ? ' is-expanded' : ''}`}>
      <button
        className="source-list__toggle"
        type="button"
        onClick={() => setIsExpanded((current) => !current)}
        aria-expanded={isExpanded}
      >
        <span>
          {chunks.length} {chunks.length === 1 ? 'source' : 'sources'}
          {citedCount > 0 ? ` / ${citedCount} cited` : ''}
        </span>
        <ChevronDown size={14} className={isExpanded ? 'is-rotated' : ''} />
      </button>

      {isExpanded && (
        <div className="source-list__items">
          {visibleChunks.map((chunk, index) => (
            <SourceItem
              key={chunk.chunkId ?? index}
              number={index + 1}
              chunk={chunk}
              isCited={citedSet.has(index)}
            />
          ))}

          {hiddenCount > 0 && (
            <button
              className="source-list__more"
              type="button"
              onClick={() => setShowAll(true)}
            >
              Show {hiddenCount} more
            </button>
          )}
        </div>
      )}
    </div>
  );
}
