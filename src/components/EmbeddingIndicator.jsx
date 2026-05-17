import { AlertCircle, CheckCircle2, Database, LoaderCircle } from 'lucide-react';
import { useEmbedding } from '../lib/embeddingContext.jsx';
import './EmbeddingIndicator.css';

function formatStage(stage) {
  if (!stage) return 'Preparing';
  if (stage === 'queued') return 'Queued';
  return stage.charAt(0).toUpperCase() + stage.slice(1);
}

export default function EmbeddingIndicator() {
  const {
    activeJobs,
    recentJobs,
    totalProgress,
    hasActiveJobs,
  } = useEmbedding();
  const latestRecentJob = recentJobs[recentJobs.length - 1] ?? null;
  const failedJob = latestRecentJob?.status === 'failed' ? latestRecentJob : null;
  const completedJob = latestRecentJob?.status === 'completed' ? latestRecentJob : null;

  if (!hasActiveJobs && !failedJob && !completedJob) {
    return null;
  }

  const statusClass = failedJob
    ? ' is-failed'
    : completedJob && !hasActiveJobs
      ? ' is-completed'
      : ' is-active';
  const label = failedJob
    ? 'Embedding failed'
    : completedJob && !hasActiveJobs
      ? 'Embedding complete'
      : `Embedding ${activeJobs.length} document${activeJobs.length === 1 ? '' : 's'}`;
  const detail = failedJob
    ? failedJob.error || 'Check Upload for details.'
    : completedJob && !hasActiveJobs
      ? completedJob.documentId ? 'Document indexed.' : 'Finished.'
      : totalProgress?.total > 0
        ? `${totalProgress.processed}/${totalProgress.total} chunks`
        : formatStage(totalProgress?.stage);

  return (
    <div className={`embedding-indicator${statusClass}`} role="status" aria-live="polite">
      <span className="embedding-indicator__icon" aria-hidden="true">
        {failedJob ? (
          <AlertCircle size={16} />
        ) : completedJob && !hasActiveJobs ? (
          <CheckCircle2 size={16} />
        ) : (
          <LoaderCircle size={16} />
        )}
      </span>
      <span className="embedding-indicator__content">
        <strong>{label}</strong>
        <span>{detail}</span>
        {hasActiveJobs && (
          <span className="embedding-indicator__progress" aria-hidden="true">
            <span style={{ width: `${totalProgress?.percent ?? 0}%` }} />
          </span>
        )}
      </span>
      <Database className="embedding-indicator__database" size={15} aria-hidden="true" />
    </div>
  );
}
