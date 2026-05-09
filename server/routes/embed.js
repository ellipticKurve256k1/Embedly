import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  clearDocumentIndex,
  db,
  getUploadPath,
  nowIso,
  updateDocumentChunkCount,
  updateDocumentStatus,
} from '../db.js';
import { chunkText } from '../services/chunker.js';
import { DEFAULT_EMBEDDING_MODEL, embedText, vectorToBlob } from '../services/embedder.js';
import { parseFile } from '../services/parser.js';

const router = express.Router();

function toPublicJob(row) {
  return {
    id: row.id,
    documentId: row.document_id,
    status: row.status,
    model: row.model,
    totalChunks: row.total_chunks,
    processedChunks: row.processed_chunks,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function processDocument(document, { chunking, model }) {
  const jobId = uuidv4();
  const createdAt = nowIso();

  clearDocumentIndex(document.id);
  updateDocumentStatus(document.id, 'parsing');

  db.prepare(`
    INSERT INTO embedding_jobs (
      id, document_id, status, model, total_chunks, processed_chunks, error, created_at, updated_at
    )
    VALUES (?, ?, 'running', ?, 0, 0, NULL, ?, ?)
  `).run(jobId, document.id, model, createdAt, createdAt);

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
    const chunks = chunkText(text, chunking);

    if (chunks.length === 0) {
      throw new Error('No chunks were produced from this document.');
    }

    updateDocumentStatus(document.id, 'embedding');
    updateDocumentChunkCount(document.id, chunks.length);
    db.prepare(`
      UPDATE embedding_jobs
      SET total_chunks = ?, updated_at = ?
      WHERE id = ?
    `).run(chunks.length, nowIso(), jobId);

    const insertChunk = db.prepare(`
      INSERT INTO chunks (id, document_id, idx, content, token_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insertEmbedding = db.prepare(`
      INSERT INTO embeddings (id, chunk_id, vector, model, dimensions, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const updateJobProgress = db.prepare(`
      UPDATE embedding_jobs
      SET processed_chunks = ?, updated_at = ?
      WHERE id = ?
    `);

    for (const chunk of chunks) {
      const chunkId = uuidv4();
      insertChunk.run(chunkId, document.id, chunk.idx, chunk.content, chunk.tokenCount, nowIso());

      const vector = await embedText(chunk.content, model);
      insertEmbedding.run(
        uuidv4(),
        chunkId,
        vectorToBlob(vector),
        model,
        vector.length,
        nowIso(),
      );
      updateJobProgress.run(chunk.idx + 1, nowIso(), jobId);
    }

    updateDocumentStatus(document.id, 'completed');
    db.prepare(`
      UPDATE embedding_jobs
      SET status = 'completed', updated_at = ?
      WHERE id = ?
    `).run(nowIso(), jobId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Embedding failed.';

    updateDocumentStatus(document.id, 'failed', message);
    db.prepare(`
      UPDATE embedding_jobs
      SET status = 'failed', error = ?, updated_at = ?
      WHERE id = ?
    `).run(message, nowIso(), jobId);
  }

  return db.prepare('SELECT * FROM embedding_jobs WHERE id = ?').get(jobId);
}

router.post('/', async (request, response) => {
  const documentIds = Array.isArray(request.body?.documentIds) ? request.body.documentIds : [];
  const uniqueDocumentIds = [...new Set(documentIds)].filter(Boolean);

  if (uniqueDocumentIds.length === 0) {
    response.status(400).json({ error: 'documentIds must contain at least one document id.' });
    return;
  }

  const placeholders = uniqueDocumentIds.map(() => '?').join(', ');
  const documents = db.prepare(`
    SELECT *
    FROM documents
    WHERE id IN (${placeholders})
    ORDER BY created_at ASC
  `).all(...uniqueDocumentIds);

  if (documents.length !== uniqueDocumentIds.length) {
    response.status(404).json({ error: 'One or more documents were not found.' });
    return;
  }

  const model = request.body?.model || DEFAULT_EMBEDDING_MODEL;
  const jobs = [];

  for (const document of documents) {
    const job = await processDocument(document, {
      chunking: request.body?.chunking,
      model,
    });
    jobs.push(toPublicJob(job));
  }

  response.json({ jobs });
});

export default router;
