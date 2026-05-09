import { useMemo, useCallback } from 'react';
import { File } from 'lucide-react';
import './OntologyMap.css';

function getScoreColor(score) {
  if (score >= 0.85) return '#2f7b5f';
  if (score >= 0.7) return '#6258ff';
  if (score >= 0.5) return '#8c7a4a';
  return '#8c96ad';
}

function getScoreOpacity(score) {
  if (score >= 0.85) return 1;
  if (score >= 0.7) return 0.88;
  if (score >= 0.5) return 0.76;
  return 0.64;
}

function truncateText(text, maxLength = 20) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

export default function OntologyMap({ query, results, selectedId, onSelectNode }) {
  const viewBox = useMemo(() => {
    if (typeof window === 'undefined') return '0 0 600 400';
    const width = Math.min(600, window.innerWidth - 48);
    const height = Math.min(400, window.innerHeight - 280);
    return `0 0 ${width} ${height}`;
  }, []);

  const positionedResults = useMemo(() => {
    if (!results || results.length === 0) return [];

    const width = typeof window !== 'undefined' ? Math.min(600, window.innerWidth - 48) : 600;
    const height = typeof window !== 'undefined' ? Math.min(400, window.innerHeight - 280) : 400;
    const centerX = width / 2;
    const centerY = height / 2;
    const minRadius = 70;
    const maxRadius = Math.min(width, height) / 2 - 50;

    return results.map((result, index) => {
      const angle = (index / results.length) * 2 * Math.PI - Math.PI / 2;
      const normalizedScore = result.score;
      const distance = minRadius + (1 - normalizedScore) * (maxRadius - minRadius) * 0.7;

      const x = centerX + Math.cos(angle) * distance;
      const y = centerY + Math.sin(angle) * distance;

      return {
        ...result,
        x,
        y,
        color: getScoreColor(normalizedScore),
        opacity: getScoreOpacity(normalizedScore),
      };
    });
  }, [results]);

  const width = typeof window !== 'undefined' ? Math.min(600, window.innerWidth - 48) : 600;
  const height = typeof window !== 'undefined' ? Math.min(400, window.innerHeight - 280) : 400;
  const centerX = width / 2;
  const centerY = height / 2;

  const handleNodeClick = useCallback((result) => {
    onSelectNode(result);
  }, [onSelectNode]);

  if (!results || results.length === 0) {
    return null;
  }

  return (
    <div className="ontology-map">
      <svg viewBox={viewBox} className="ontology-svg">
        <defs>
          <filter id="ontology-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="query-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#7368ff" />
            <stop offset="100%" stopColor="#5144f1" />
          </linearGradient>
        </defs>

        {positionedResults.map((result) => (
          <line
            key={`edge-${result.chunkId}`}
            className="ontology-edge"
            x1={centerX}
            y1={centerY}
            x2={result.x}
            y2={result.y}
            stroke={result.color}
            strokeOpacity={result.opacity * 0.4}
          />
        ))}

        <g className="ontology-query-node">
          <circle
            cx={centerX}
            cy={centerY}
            r={28}
            fill="url(#query-gradient)"
            filter="url(#ontology-glow)"
          />
          <text
            x={centerX}
            y={centerY}
            className="ontology-query-label"
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {truncateText(query, 12) || 'Query'}
          </text>
        </g>

        {positionedResults.map((result) => {
          const isSelected = selectedId === result.chunkId;

          return (
            <g
              key={`node-${result.chunkId}`}
              className={`ontology-result-node${isSelected ? ' is-selected' : ''}`}
              onClick={() => handleNodeClick(result)}
              style={{ cursor: 'pointer' }}
            >
              {isSelected && (
                <circle
                  cx={result.x}
                  cy={result.y}
                  r={30}
                  fill="none"
                  stroke={result.color}
                  strokeWidth={2}
                  strokeOpacity={0.6}
                  className="ontology-selection-ring"
                />
              )}
              <circle
                cx={result.x}
                cy={result.y}
                r={22}
                fill={result.color}
                fillOpacity={result.opacity}
                className="ontology-node-circle"
              />
              <text
                x={result.x}
                y={result.y - 28}
                className="ontology-node-label"
                textAnchor="middle"
              >
                {truncateText(result.documentName?.replace(/\.[^.]+$/, ''), 16)}
              </text>
              <text
                x={result.x}
                y={result.y}
                className="ontology-node-score"
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {Math.round(result.score * 100)}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="ontology-legend">
        <div className="ontology-legend-item">
          <span className="ontology-legend-dot" style={{ background: '#2f7b5f' }} />
          <span>High match</span>
        </div>
        <div className="ontology-legend-item">
          <span className="ontology-legend-dot" style={{ background: '#6258ff' }} />
          <span>Good match</span>
        </div>
        <div className="ontology-legend-item">
          <span className="ontology-legend-dot" style={{ background: '#8c96ad' }} />
          <span>Low match</span>
        </div>
      </div>
    </div>
  );
}
