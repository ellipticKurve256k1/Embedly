import { db } from '../db.js';
import {
  blobToVector,
  cosineSimilarity,
  DEFAULT_EMBEDDING_MODEL,
  embedText,
} from './embedder.js';
import { isRerankerEnabled, rerankDocuments } from './reranker.js';

export const DEFAULT_RETRIEVAL_LIMIT = 5;
export const DEFAULT_CANDIDATE_LIMIT = 20;

function normalizeLimit(value, fallback, { min = 1, max = 100 } = {}) {
  const limit = Number(value);

  if (!Number.isInteger(limit)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, limit));
}

export function toPublicChunk(row, score) {
  return {
    chunkId: row.chunk_id,
    chunkIndex: row.chunk_index,
    content: row.content,
    documentId: row.document_id,
    documentName: row.document_name,
    documentType: row.document_type,
    documentSize: row.document_size,
    uploadedAt: row.uploaded_at,
    totalChunks: row.total_chunks,
    tokenCount: row.token_count,
    embeddingModel: row.embedding_model,
    previousChunk: null,
    nextChunk: null,
    score,
  };
}

export function toContextChunk(chunk) {
  return {
    chunkId: chunk.chunkId,
    chunkIndex: chunk.chunkIndex,
    documentId: chunk.documentId,
    documentName: chunk.documentName,
    documentType: chunk.documentType,
    documentSize: chunk.documentSize,
    uploadedAt: chunk.uploadedAt,
    totalChunks: chunk.totalChunks,
    tokenCount: chunk.tokenCount,
    embeddingModel: chunk.embeddingModel,
    previousChunk: chunk.previousChunk,
    nextChunk: chunk.nextChunk,
    content: chunk.content,
    score: chunk.score,
    rerankScore: chunk.rerankScore,
    preview: chunk.content
      ? `${chunk.content.slice(0, 260)}${chunk.content.length > 260 ? '...' : ''}`
      : '',
  };
}

function toAdjacentChunk(row) {
  if (!row) {
    return null;
  }

  return {
    chunkId: row.id,
    chunkIndex: row.idx,
    content: row.content
      ? `${row.content.slice(0, 320)}${row.content.length > 320 ? '...' : ''}`
      : '',
    tokenCount: row.token_count,
  };
}

function getAdjacentChunk(documentId, chunkIndex, offset) {
  const row = db.prepare(`
    SELECT id, idx, content, token_count
    FROM chunks
    WHERE document_id = ? AND idx = ?
  `).get(documentId, chunkIndex + offset);

  return toAdjacentChunk(row);
}

function withAdjacentContext(chunk) {
  return {
    ...chunk,
    previousChunk: getAdjacentChunk(chunk.documentId, chunk.chunkIndex, -1),
    nextChunk: getAdjacentChunk(chunk.documentId, chunk.chunkIndex, 1),
  };
}

export async function retrieveChunks(query, {
  model = DEFAULT_EMBEDDING_MODEL,
  limit = DEFAULT_RETRIEVAL_LIMIT,
  candidateLimit,
  topK,
  reranker = null,
} = {}) {
  const trimmedQuery = String(query ?? '').trim();

  if (!trimmedQuery) {
    throw new Error('Search query is required.');
  }

  const finalLimit = normalizeLimit(topK ?? limit, DEFAULT_RETRIEVAL_LIMIT, { max: 50 });
  const shouldRerank = isRerankerEnabled(reranker);
  const finalCandidateLimit = shouldRerank
    ? Math.max(
      finalLimit,
      normalizeLimit(candidateLimit, DEFAULT_CANDIDATE_LIMIT, { min: finalLimit, max: 100 }),
    )
    : finalLimit;
  const queryVector = Float32Array.from(await embedText(trimmedQuery, model));
  const rows = db.prepare(`
    SELECT
      embeddings.vector,
      embeddings.model AS embedding_model,
      chunks.id AS chunk_id,
      chunks.idx AS chunk_index,
      chunks.content,
      chunks.token_count,
      documents.id AS document_id,
      documents.filename AS document_name,
      documents.mime_type AS document_type,
      documents.size_bytes AS document_size,
      documents.created_at AS uploaded_at,
      documents.chunk_count AS total_chunks
    FROM embeddings
    JOIN chunks ON chunks.id = embeddings.chunk_id
    JOIN documents ON documents.id = chunks.document_id
    WHERE embeddings.model = ?
  `).all(model);

  const candidates = rows
    .map((row) => toPublicChunk(row, cosineSimilarity(queryVector, blobToVector(row.vector))))
    .sort((a, b) => b.score - a.score)
    .slice(0, finalCandidateLimit)
    .map(withAdjacentContext);

  if (!shouldRerank) {
    return candidates.slice(0, finalLimit);
  }

  const rerankedCandidates = await rerankDocuments(trimmedQuery, candidates, reranker);
  return rerankedCandidates.slice(0, finalLimit);
}
