import { v4 as uuidv4 } from 'uuid';
import {
  clearDocumentIndex,
  db,
  getUploadPath,
  nowIso,
  updateDocumentChunkCount,
  updateDocumentStatus,
} from '../db.js';
import { chunkText } from './chunker.js';
import { DEFAULT_EMBEDDING_MODEL, embedText } from './embedder.js';
import { parseFile } from './parser.js';
import { getVectorDbSetup } from './settings.js';
import { createVectorStore } from './vectorStores/index.js';

const ACTIVE_JOB_STATUSES = new Set(['pending', 'running']);
const ACTIVE_DOCUMENT_STATUSES = new Set(['parsing', 'chunking', 'embedding', 'indexing']);
const RECENT_COMPLETED_LIMIT = 10;

export function toPublicJob(row) {
  if (!row) return null;

  const stage = row.status === 'pending' ? 'queued' : row.document_status || row.status;

  return {
    id: row.id,
    documentId: row.document_id,
    status: row.status,
    stage,
    model: row.model,
    totalChunks: row.total_chunks,
    processedChunks: row.processed_chunks,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getJobRow(jobId) {
  return db.prepare(`
    SELECT
      embedding_jobs.*,
      documents.status AS document_status
    FROM embedding_jobs
    LEFT JOIN documents ON documents.id = embedding_jobs.document_id
    WHERE embedding_jobs.id = ?
  `).get(jobId);
}

function listActiveJobRows() {
  return db.prepare(`
    SELECT
      embedding_jobs.*,
      documents.status AS document_status
    FROM embedding_jobs
    LEFT JOIN documents ON documents.id = embedding_jobs.document_id
    WHERE embedding_jobs.status IN ('pending', 'running')
    ORDER BY embedding_jobs.created_at ASC
  `).all();
}

function listRecentCompletedJobRows() {
  return db.prepare(`
    SELECT
      embedding_jobs.*,
      documents.status AS document_status
    FROM embedding_jobs
    LEFT JOIN documents ON documents.id = embedding_jobs.document_id
    WHERE embedding_jobs.status IN ('completed', 'failed')
    ORDER BY embedding_jobs.updated_at DESC
    LIMIT ?
  `).all(RECENT_COMPLETED_LIMIT);
}

function listDocumentsByIds(documentIds) {
  if (documentIds.length === 0) return [];

  const placeholders = documentIds.map(() => '?').join(', ');
  return db.prepare(`
    SELECT *
    FROM documents
    WHERE id IN (${placeholders})
    ORDER BY created_at ASC
  `).all(...documentIds);
}

class EmbedQueue {
  constructor() {
    this.queue = [];
    this.active = null;
    this.processing = false;
    this.subscribers = new Set();
    this.markInterruptedJobsFailed();
  }

  markInterruptedJobsFailed() {
    const interruptedJobs = db.prepare(`
      SELECT id, document_id
      FROM embedding_jobs
      WHERE status IN ('pending', 'running')
    `).all();

    if (interruptedJobs.length === 0) return;

    const message = 'Embedding was interrupted before the background worker finished.';

    db.transaction(() => {
      const updateJob = db.prepare(`
        UPDATE embedding_jobs
        SET status = 'failed', error = ?, updated_at = ?
        WHERE id = ?
      `);

      interruptedJobs.forEach((job) => {
        updateJob.run(message, nowIso(), job.id);
        updateDocumentStatus(job.document_id, 'failed', message);
      });
    })();
  }

  async enqueueDocuments(documentIds, options = {}) {
    const uniqueDocumentIds = [...new Set(documentIds)].filter(Boolean);
    const documents = listDocumentsByIds(uniqueDocumentIds);

    if (documents.length !== uniqueDocumentIds.length) {
      const error = new Error('One or more documents were not found.');
      error.statusCode = 404;
      throw error;
    }

    return Promise.all(documents.map((document) => this.enqueueDocument(document, options)));
  }

  async enqueueDocument(document, options = {}) {
    const existingQueuedJob = this.queue.find((queuedJob) => queuedJob.documentId === document.id);

    if (existingQueuedJob) {
      return toPublicJob(getJobRow(existingQueuedJob.id));
    }

    if (this.active?.documentId === document.id) {
      return toPublicJob(getJobRow(this.active.id));
    }

    const existingActiveRow = db.prepare(`
      SELECT
        embedding_jobs.*,
        documents.status AS document_status
      FROM embedding_jobs
      LEFT JOIN documents ON documents.id = embedding_jobs.document_id
      WHERE embedding_jobs.document_id = ?
        AND embedding_jobs.status IN ('pending', 'running')
      ORDER BY embedding_jobs.created_at DESC
      LIMIT 1
    `).get(document.id);

    if (existingActiveRow) {
      return toPublicJob(existingActiveRow);
    }

    const model = String(options.model || DEFAULT_EMBEDDING_MODEL).trim() || DEFAULT_EMBEDDING_MODEL;
    const jobId = uuidv4();
    const createdAt = nowIso();
    const vectorDbSetup = getVectorDbSetup();
    const vectorStore = createVectorStore(vectorDbSetup);

    clearDocumentIndex(document.id);
    await vectorStore.clearDocumentIndex(document.id);
    updateDocumentStatus(document.id, 'embedding');

    db.prepare(`
      INSERT INTO embedding_jobs (
        id, document_id, status, model, total_chunks, processed_chunks, error, created_at, updated_at
      )
      VALUES (?, ?, 'pending', ?, 0, 0, NULL, ?, ?)
    `).run(jobId, document.id, model, createdAt, createdAt);

    const queuedJob = {
      id: jobId,
      documentId: document.id,
      chunking: options.chunking,
      model,
      vectorDbSetup,
    };

    this.queue.push(queuedJob);
    this.broadcast({ type: 'queued', job: toPublicJob(getJobRow(jobId)) });
    this.processNext();

    return toPublicJob(getJobRow(jobId));
  }

  processNext() {
    if (this.processing) return;

    const nextJob = this.queue.shift();

    if (!nextJob) {
      this.active = null;
      return;
    }

    this.processing = true;
    this.active = nextJob;

    this.processJob(nextJob)
      .catch((error) => {
        this.failJob(nextJob.id, nextJob.documentId, error);
      })
      .finally(() => {
        this.processing = false;
        this.active = null;
        this.processNext();
      });
  }

  async processJob(job) {
    const document = db.prepare(`
      SELECT
        documents.*,
        projects.name AS project_name
      FROM documents
      LEFT JOIN projects ON projects.id = documents.project_id
      WHERE documents.id = ?
    `).get(job.documentId);

    if (!document) {
      throw new Error('Document was deleted before embedding started.');
    }

    this.updateJob(job.id, { status: 'running' });
    updateDocumentStatus(document.id, 'parsing');
    this.broadcast({ type: 'started', job: toPublicJob(getJobRow(job.id)) });

    try {
      const text = await parseFile({
        filePath: getUploadPath(document.stored_filename),
        filename: document.filename,
        mimeType: document.mime_type,
      });

      if (!text.trim()) {
        throw new Error('Parsed document content is empty.');
      }

      updateDocumentStatus(document.id, 'chunking');
      this.broadcast({ type: 'progress', job: toPublicJob(getJobRow(job.id)) });

      const chunks = chunkText(text, job.chunking);

      if (chunks.length === 0) {
        throw new Error('No chunks were produced from this document.');
      }

      updateDocumentStatus(document.id, 'embedding');
      updateDocumentChunkCount(document.id, chunks.length);
      this.updateJob(job.id, { totalChunks: chunks.length, processedChunks: 0 });
      this.broadcast({ type: 'progress', job: toPublicJob(getJobRow(job.id)) });

      const insertChunk = db.prepare(`
        INSERT INTO chunks (id, document_id, idx, content, token_count, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const vectorStore = createVectorStore(job.vectorDbSetup);
      const indexedDocument = {
        ...document,
        chunk_count: chunks.length,
      };

      for (const chunk of chunks) {
        const chunkId = uuidv4();
        insertChunk.run(chunkId, document.id, chunk.idx, chunk.content, chunk.tokenCount, nowIso());

        const indexedChunk = {
          ...chunk,
          id: chunkId,
        };
        const vector = await embedText(chunk.content, job.model);
        await vectorStore.indexChunk({
          document: indexedDocument,
          chunk: indexedChunk,
          vector,
          model: job.model,
        });

        this.updateJob(job.id, { processedChunks: chunk.idx + 1 });
        this.broadcast({ type: 'progress', job: toPublicJob(getJobRow(job.id)) });
      }

      updateDocumentStatus(document.id, 'completed');
      this.updateJob(job.id, { status: 'completed' });
      this.broadcast({ type: 'completed', job: toPublicJob(getJobRow(job.id)) });
    } catch (error) {
      this.failJob(job.id, document.id, error);
    }
  }

  updateJob(jobId, { status, totalChunks, processedChunks, error } = {}) {
    const fields = [];
    const values = [];

    if (status) {
      fields.push('status = ?');
      values.push(status);
    }

    if (Number.isFinite(totalChunks)) {
      fields.push('total_chunks = ?');
      values.push(totalChunks);
    }

    if (Number.isFinite(processedChunks)) {
      fields.push('processed_chunks = ?');
      values.push(processedChunks);
    }

    if (error !== undefined) {
      fields.push('error = ?');
      values.push(error);
    }

    if (fields.length === 0) return;

    fields.push('updated_at = ?');
    values.push(nowIso(), jobId);

    db.prepare(`
      UPDATE embedding_jobs
      SET ${fields.join(', ')}
      WHERE id = ?
    `).run(...values);
  }

  failJob(jobId, documentId, error) {
    const message = error instanceof Error ? error.message : 'Embedding failed.';

    updateDocumentStatus(documentId, 'failed', message);
    this.updateJob(jobId, { status: 'failed', error: message });
    this.broadcast({ type: 'failed', job: toPublicJob(getJobRow(jobId)) });
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  broadcast(event) {
    this.subscribers.forEach((callback) => {
      callback(event);
    });
  }

  getStatus() {
    const activeJobs = listActiveJobRows().map(toPublicJob);
    const active = this.active ? toPublicJob(getJobRow(this.active.id)) : null;

    return {
      queueLength: this.queue.length,
      active,
      activeJobs,
      recentlyCompleted: listRecentCompletedJobRows().map(toPublicJob),
    };
  }
}

export const embedQueue = new EmbedQueue();
export { ACTIVE_JOB_STATUSES, ACTIVE_DOCUMENT_STATUSES };
