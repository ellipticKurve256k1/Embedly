import express from 'express';
import { db } from '../db.js';

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

router.get('/', (_request, response) => {
  const jobs = db.prepare(`
    SELECT *
    FROM embedding_jobs
    ORDER BY created_at DESC
  `).all();

  response.json({ jobs: jobs.map(toPublicJob) });
});

router.get('/:id', (request, response) => {
  const job = db.prepare('SELECT * FROM embedding_jobs WHERE id = ?').get(request.params.id);

  if (!job) {
    response.status(404).json({ error: 'Job not found.' });
    return;
  }

  response.json({ job: toPublicJob(job) });
});

export default router;
