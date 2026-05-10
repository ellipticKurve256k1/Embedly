import { db } from '../db.js';
import {
  blobToVector,
  cosineSimilarity,
  DEFAULT_EMBEDDING_MODEL,
  embedText,
} from './embedder.js';

export const DEFAULT_RETRIEVAL_LIMIT = 5;

export function toPublicChunk(row, score) {
  return {
    chunkId: row.chunk_id,
    chunkIndex: row.chunk_index,
    content: row.content,
    documentId: row.document_id,
    documentName: row.document_name,
    score,
  };
}

export function toContextChunk(chunk) {
  return {
    chunkId: chunk.chunkId,
    chunkIndex: chunk.chunkIndex,
    documentId: chunk.documentId,
    documentName: chunk.documentName,
    score: chunk.score,
    preview: chunk.content
      ? `${chunk.content.slice(0, 260)}${chunk.content.length > 260 ? '...' : ''}`
      : '',
  };
}

export async function retrieveChunks(query, {
  model = DEFAULT_EMBEDDING_MODEL,
  limit = DEFAULT_RETRIEVAL_LIMIT,
} = {}) {
  const trimmedQuery = String(query ?? '').trim();

  if (!trimmedQuery) {
    throw new Error('Search query is required.');
  }

  const queryVector = Float32Array.from(await embedText(trimmedQuery, model));
  const rows = db.prepare(`
    SELECT
      embeddings.vector,
      chunks.id AS chunk_id,
      chunks.idx AS chunk_index,
      chunks.content,
      documents.id AS document_id,
      documents.filename AS document_name
    FROM embeddings
    JOIN chunks ON chunks.id = embeddings.chunk_id
    JOIN documents ON documents.id = chunks.document_id
    WHERE embeddings.model = ?
  `).all(model);

  return rows
    .map((row) => toPublicChunk(row, cosineSimilarity(queryVector, blobToVector(row.vector))))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
