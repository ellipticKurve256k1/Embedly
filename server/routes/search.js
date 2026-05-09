import express from 'express';
import { db } from '../db.js';
import {
  blobToVector,
  cosineSimilarity,
  DEFAULT_EMBEDDING_MODEL,
  embedText,
} from '../services/embedder.js';

const router = express.Router();

router.get('/', async (request, response) => {
  const query = String(request.query.q ?? '').trim();

  if (!query) {
    response.status(400).json({ error: 'Search query is required.' });
    return;
  }

  const model = request.query.model || DEFAULT_EMBEDDING_MODEL;
  const queryVector = Float32Array.from(await embedText(query, model));
  const rows = db.prepare(`
    SELECT
      embeddings.vector,
      chunks.id AS chunk_id,
      chunks.content,
      documents.id AS document_id,
      documents.filename AS document_name
    FROM embeddings
    JOIN chunks ON chunks.id = embeddings.chunk_id
    JOIN documents ON documents.id = chunks.document_id
  `).all();

  const results = rows
    .map((row) => ({
      chunkId: row.chunk_id,
      content: row.content,
      documentId: row.document_id,
      documentName: row.document_name,
      score: cosineSimilarity(queryVector, blobToVector(row.vector)),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  response.json({ results });
});

export default router;
