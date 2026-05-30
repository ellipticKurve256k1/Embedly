import { v4 as uuidv4 } from 'uuid';
import { db, nowIso } from '../../db.js';
import { blobToVector, cosineSimilarity, vectorToBlob } from '../embedder.js';
import { toPublicVectorChunk } from './publicChunk.js';

function normalizeUserId(userId) {
  return String(userId ?? '').trim();
}

export function createSqliteVectorStore(userId = '') {
  const normalizedUserId = normalizeUserId(userId);

  return {
    provider: 'sqlite',

    async testConnection() {
      return true;
    },

    async clearDocumentIndex(documentId) {
      db.prepare(`
        DELETE FROM embeddings
        WHERE chunk_id IN (SELECT id FROM chunks WHERE document_id = ?)
      `).run(documentId);
    },

    async indexChunk({ chunk, vector, model }) {
      if (!chunk?.id) {
        throw new Error('Chunk id is required for SQLite indexing.');
      }

      db.prepare(`
        INSERT INTO embeddings (id, chunk_id, vector, model, dimensions, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), chunk.id, vectorToBlob(vector), model, vector.length, nowIso());
    },

    async retrieveChunks({ queryVector, model, projectId = null, limit }) {
      const queryParams = [model];
      const userFilter = 'AND documents.user_id = ?';
      queryParams.push(normalizedUserId);
      const projectFilter = projectId ? 'AND documents.project_id = ?' : '';
      if (projectId) {
        queryParams.push(projectId);
      }

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
          documents.project_id,
          projects.name AS project_name,
          documents.created_at AS uploaded_at,
          documents.chunk_count AS total_chunks
        FROM embeddings
        JOIN chunks ON chunks.id = embeddings.chunk_id
        JOIN documents ON documents.id = chunks.document_id
        LEFT JOIN projects ON projects.id = documents.project_id
          AND projects.user_id = documents.user_id
        WHERE embeddings.model = ?
          ${userFilter}
          ${projectFilter}
      `).all(...queryParams);

      return rows
        .map((row) => toPublicVectorChunk(row, cosineSimilarity(queryVector, blobToVector(row.vector))))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    },
  };
}
