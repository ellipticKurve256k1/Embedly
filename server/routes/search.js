import express from 'express';
import { DEFAULT_EMBEDDING_MODEL } from '../services/embedder.js';
import { isRerankerEnabled } from '../services/reranker.js';
import { retrieveChunks } from '../services/retrieval.js';
import { getEmbeddingSetup, getRerankerSetup } from '../services/settings.js';

const router = express.Router();
const SEARCH_CANDIDATE_LIMIT = 20;
const SEARCH_RETRIEVAL_LIMIT = 5;

router.get('/', async (request, response) => {
  const query = String(request.query.q ?? '').trim();
  const projectId = String(request.query.projectId ?? '').trim() || null;

  if (!query) {
    response.status(400).json({ error: 'Search query is required.' });
    return;
  }

  const embeddingSetup = getEmbeddingSetup() ?? {};
  const rerankerSetup = getRerankerSetup() ?? {};
  const model = String(request.query.model || embeddingSetup.model || DEFAULT_EMBEDDING_MODEL).trim();
  const candidateLimit = rerankerSetup.candidateLimit ?? SEARCH_CANDIDATE_LIMIT;
  const topK = rerankerSetup.topK ?? SEARCH_RETRIEVAL_LIMIT;
  const results = await retrieveChunks(query, {
    model,
    candidateLimit,
    topK,
    reranker: isRerankerEnabled(rerankerSetup) ? rerankerSetup : null,
    projectId,
    userId: null,
  });
  const rerankerUsed = results.some((result) => typeof result.rerankScore === 'number');

  response.json({
    results,
    rerankerUsed,
    rerankerEnabled: isRerankerEnabled(rerankerSetup),
    rerankerModel: rerankerUsed ? rerankerSetup.model : null,
    candidateLimit,
    topK,
    projectId,
  });
});

export default router;
