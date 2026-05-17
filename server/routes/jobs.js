import express from 'express';
import { db } from '../db.js';
import { toPublicJob } from '../services/embedQueue.js';

const router = express.Router();

router.get('/', (_request, response) => {
  const jobs = db.prepare(`
    SELECT
      embedding_jobs.*,
      documents.status AS document_status
    FROM embedding_jobs
    LEFT JOIN documents ON documents.id = embedding_jobs.document_id
    ORDER BY embedding_jobs.created_at DESC
  `).all();

  response.json({ jobs: jobs.map(toPublicJob) });
});

router.get('/:id', (request, response) => {
  const job = db.prepare(`
    SELECT
      embedding_jobs.*,
      documents.status AS document_status
    FROM embedding_jobs
    LEFT JOIN documents ON documents.id = embedding_jobs.document_id
    WHERE embedding_jobs.id = ?
  `).get(request.params.id);

  if (!job) {
    response.status(404).json({ error: 'Job not found.' });
    return;
  }

  response.json({ job: toPublicJob(job) });
});

export default router;
