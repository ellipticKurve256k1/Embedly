import express from 'express';
import { DEFAULT_EMBEDDING_MODEL } from '../services/embedder.js';
import { retrieveChunks } from '../services/retrieval.js';

const router = express.Router();

router.get('/', async (request, response) => {
  const query = String(request.query.q ?? '').trim();

  if (!query) {
    response.status(400).json({ error: 'Search query is required.' });
    return;
  }

  const model = request.query.model || DEFAULT_EMBEDDING_MODEL;
  const results = await retrieveChunks(query, { model });

  response.json({ results });
});

export default router;
