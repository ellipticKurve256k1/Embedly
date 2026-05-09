import { useMemo, useCallback, useState, useEffect } from 'react';
import './OntologyMap.css';

function getScoreColor(score) {
  if (score >= 0.85) return '#2f7b5f';
  if (score >= 0.7) return '#6258ff';
  if (score >= 0.5) return '#9d8b52';
  return '#8c96ad';
}

function getScoreLabel(score) {
  if (score >= 0.85) return 'High';
  if (score >= 0.7) return 'Good';
  if (score >= 0.5) return 'Fair';
  return 'Low';
}

function truncateText(text, maxLength = 24) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

const SVG_WIDTH = 720;
const SVG_HEIGHT = 440;

export default function OntologyMap({ query, results, selectedId, onSelectNode }) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsReady(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const positionedResults = useMemo(() => {
    if (!results || results.length === 0) return [];

    const cx = SVG_WIDTH / 2;
    const cy = SVG_HEIGHT / 2;
    const minRadius = 90;
    const maxRadius = 170;

    return results.map((result, index) => {
      const angle = (index / results.length) * 2 * Math.PI - Math.PI / 2;
      const distance = minRadius + (1 - result.score) * (maxRadius - minRadius);

      return {
        ...result,
        x: cx + Math.cos(angle) * distance,
        y: cy + Math.sin(angle) * distance,
        cx,
        cy,
        color: getScoreColor(result.score),
        label: getScoreLabel(result.score),
        delay: index * 80,
      };
    });
  }, [results]);

  const handleNodeClick = useCallback((result) => {
    onSelectNode(result);
  }, [onSelectNode]);

  if (!results || results.length === 0) {
    return null;
  }

  return (
    <div className="ontology-map">
      <div className="ontology-map-header">
        <strong>Results from {results.length} chunks</strong>
        {query && (
          <span className="ontology-query-subtitle">
            Query: <em>{truncateText(query, 40)}</em>
          </span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        className="ontology-svg"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <radialGradient id="queryGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#7368ff" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#7368ff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="queryFill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#7b70ff" />
            <stop offset="100%" stopColor="#5748e8" />
          </linearGradient>
          <filter id="softShadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#4c58b8" floodOpacity="0.14" />
          </filter>
        </defs>

        {/* Subtle background circles */}
        <circle cx={SVG_WIDTH / 2} cy={SVG_HEIGHT / 2} r={180} fill="none" stroke="rgba(132,146,184,0.08)" strokeWidth="1" />
        <circle cx={SVG_WIDTH / 2} cy={SVG_HEIGHT / 2} r={120} fill="none" stroke="rgba(132,146,184,0.06)" strokeWidth="1" />

        {/* Edges */}
        {positionedResults.map((r) => (
          <line
            key={`edge-${r.chunkId}`}
            className={`ontology-edge${isReady ? ' is-visible' : ''}`}
            style={{ transitionDelay: `${r.delay + 100}ms` }}
            x1={r.cx}
            y1={r.cy}
            x2={r.x}
            y2={r.y}
            stroke={r.color}
            strokeOpacity={0.22}
          />
        ))}

        {/* Result nodes */}
        {positionedResults.map((r) => {
          const isSelected = selectedId === r.chunkId;
          return (
            <g
              key={`node-${r.chunkId}`}
              className={`ontology-result${isReady ? ' is-visible' : ''}${isSelected ? ' is-selected' : ''}`}
              style={{ transitionDelay: `${r.delay}ms` }}
              onClick={() => handleNodeClick(r)}
            >
              {/* Selection ring */}
              <circle
                className="ontology-node-ring"
                cx={r.x}
                cy={r.y}
                r={34}
                fill="none"
                stroke={r.color}
                strokeWidth={isSelected ? 2 : 1.5}
                strokeOpacity={isSelected ? 0.5 : 0}
              />

              {/* Outer soft glow */}
              <circle
                cx={r.x}
                cy={r.y}
                r={26}
                fill={r.color}
                fillOpacity={0.06}
                className="ontology-node-glow"
              />

              {/* Main node */}
              <circle
                className="ontology-node-circle"
                cx={r.x}
                cy={r.y}
                r={22}
                fill={r.color}
                fillOpacity={0.14}
                stroke={r.color}
                strokeWidth={2}
                strokeOpacity={0.85}
                filter="url(#softShadow)"
              />

              {/* Inner dot */}
              <circle
                cx={r.x}
                cy={r.y}
                r={6}
                fill={r.color}
                fillOpacity={0.9}
              />

              {/* Document name label */}
              <text
                x={r.x}
                y={r.y - 40}
                className="ontology-label"
                textAnchor="middle"
              >
                {truncateText(r.documentName?.replace(/\.[^.]+$/, ''), 20)}
              </text>

              {/* Score label */}
              <text
                x={r.x}
                y={r.y + 48}
                className="ontology-score-label"
                textAnchor="middle"
              >
                {Math.round(r.score * 100)}%
              </text>

              {/* Match quality label */}
              <text
                x={r.x}
                y={r.y + 62}
                className="ontology-match-label"
                textAnchor="middle"
              >
                {r.label} match
              </text>
            </g>
          );
        })}

        {/* Query center node */}
        <g className={`ontology-query${isReady ? ' is-visible' : ''}`}>
          <circle
            cx={SVG_WIDTH / 2}
            cy={SVG_HEIGHT / 2}
            r={72}
            fill="url(#queryGlow)"
            opacity={0.7}
          />
          <circle
            cx={SVG_WIDTH / 2}
            cy={SVG_HEIGHT / 2}
            r={28}
            fill="url(#queryFill)"
            filter="url(#softShadow)"
          />
          <text
            x={SVG_WIDTH / 2}
            y={SVG_HEIGHT / 2 - 2}
            className="ontology-query-text"
            textAnchor="middle"
            dominantBaseline="central"
          >
            {truncateText(query, 10).toUpperCase() || 'QUERY'}
          </text>
        </g>
      </svg>
    </div>
  );
}
