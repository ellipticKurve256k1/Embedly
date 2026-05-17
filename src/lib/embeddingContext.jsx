import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getEmbedEventsUrl, getEmbedStatus } from './api.js';

const ACTIVE_JOB_STATUSES = new Set(['pending', 'running']);
const RECENT_JOB_TIMEOUT_MS = 6000;
const POLLING_INTERVAL_MS = 2500;

const EmbeddingContext = createContext({
  activeJobs: [],
  recentJobs: [],
  isStreaming: false,
  hasActiveJobs: false,
  totalProgress: null,
});

function isActiveJob(job) {
  return job && ACTIVE_JOB_STATUSES.has(job.status);
}

function mergeJob(jobs, job) {
  if (!job?.id) return jobs;

  const existingIndex = jobs.findIndex((currentJob) => currentJob.id === job.id);

  if (existingIndex === -1) {
    return [...jobs, job];
  }

  const nextJobs = [...jobs];
  nextJobs[existingIndex] = job;
  return nextJobs;
}

function computeTotalProgress(jobs) {
  if (jobs.length === 0) return null;

  const totalChunks = jobs.reduce((sum, job) => sum + Number(job.totalChunks || 0), 0);
  const processedChunks = jobs.reduce((sum, job) => sum + Number(job.processedChunks || 0), 0);
  const preparingJob = jobs.find((job) => Number(job.totalChunks || 0) === 0);

  if (totalChunks === 0) {
    return {
      stage: preparingJob?.stage ?? 'queued',
      percent: 0,
      total: 0,
      processed: 0,
      jobCount: jobs.length,
    };
  }

  return {
    stage: 'embedding',
    percent: Math.min(100, Math.round((processedChunks / totalChunks) * 100)),
    total: totalChunks,
    processed: processedChunks,
    jobCount: jobs.length,
  };
}

export function EmbeddingProvider({ children }) {
  const [activeJobs, setActiveJobs] = useState([]);
  const [recentJobs, setRecentJobs] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);

  useEffect(() => {
    const timeouts = new Set();

    const rememberRecentJob = (job) => {
      if (!job?.id) return;

      setRecentJobs((currentJobs) => mergeJob(
        currentJobs.filter((currentJob) => currentJob.id !== job.id),
        job,
      ));

      const timeoutId = window.setTimeout(() => {
        setRecentJobs((currentJobs) => currentJobs.filter((currentJob) => currentJob.id !== job.id));
        timeouts.delete(timeoutId);
      }, RECENT_JOB_TIMEOUT_MS);
      timeouts.add(timeoutId);
    };

    const applyStatus = (status) => {
      const nextActiveJobs = (status?.activeJobs ?? [])
        .filter(isActiveJob)
        .sort((firstJob, secondJob) => (
          String(firstJob.createdAt ?? '').localeCompare(String(secondJob.createdAt ?? ''))
        ));

      setActiveJobs(nextActiveJobs);
    };

    const applyJob = (job) => {
      if (!job?.id) return;

      if (isActiveJob(job)) {
        setActiveJobs((currentJobs) => mergeJob(currentJobs, job));
        return;
      }

      setActiveJobs((currentJobs) => currentJobs.filter((currentJob) => currentJob.id !== job.id));
      rememberRecentJob(job);
    };

    const pollStatus = async () => {
      try {
        const status = await getEmbedStatus();
        applyStatus(status);
      } catch {
        setIsStreaming(false);
      }
    };

    let eventSource = null;
    let pollIntervalId = null;

    const startPolling = () => {
      if (pollIntervalId) return;
      pollStatus();
      pollIntervalId = window.setInterval(pollStatus, POLLING_INTERVAL_MS);
    };

    if (typeof EventSource === 'function') {
      eventSource = new EventSource(getEmbedEventsUrl());

      eventSource.onopen = () => {
        setIsStreaming(true);
      };

      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);

          if (payload.type === 'status') {
            applyStatus(payload.data);
          } else if (payload.job) {
            applyJob(payload.job);
          }
        } catch {
          // Ignore malformed stream events and let polling recover if the stream fails.
        }
      };

      eventSource.onerror = () => {
        setIsStreaming(false);
        eventSource?.close();
        startPolling();
      };
    } else {
      startPolling();
    }

    return () => {
      eventSource?.close();
      if (pollIntervalId) {
        window.clearInterval(pollIntervalId);
      }
      timeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
    };
  }, []);

  const value = useMemo(() => ({
    activeJobs,
    recentJobs,
    isStreaming,
    hasActiveJobs: activeJobs.length > 0,
    totalProgress: computeTotalProgress(activeJobs),
  }), [activeJobs, isStreaming, recentJobs]);

  return (
    <EmbeddingContext.Provider value={value}>
      {children}
    </EmbeddingContext.Provider>
  );
}

export function useEmbedding() {
  return useContext(EmbeddingContext);
}
