import express from 'express';
import { unlink } from 'node:fs/promises';
import {
  db,
  getDocumentsByProject,
  getProjectById,
  getUploadPath,
  toPublicDocument,
  updateDocumentProject,
} from '../db.js';
import { getVectorStore } from '../services/vectorStores/index.js';

const router = express.Router();

function normalizeProjectId(value) {
  const projectId = String(value ?? '').trim();
  return projectId || null;
}

function getRequestUserId(request) {
  return String(request.userId ?? '').trim();
}

router.get('/', (request, response) => {
  const projectId = normalizeProjectId(request.query.projectId);
  const userId = getRequestUserId(request);

  if (projectId) {
    if (!getProjectById(userId, projectId)) {
      response.status(404).json({ error: 'Project not found.' });
      return;
    }

    response.json({ documents: getDocumentsByProject(userId, projectId) });
    return;
  }

  const rows = db.prepare(`
    SELECT *
    FROM documents
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(userId);

  response.json({ documents: rows.map(toPublicDocument) });
});

router.get('/:id', (request, response) => {
  const userId = getRequestUserId(request);
  const document = db.prepare('SELECT * FROM documents WHERE user_id = ? AND id = ?')
    .get(userId, request.params.id);

  if (!document) {
    response.status(404).json({ error: 'Document not found.' });
    return;
  }

  const chunks = db.prepare(`
    SELECT id, document_id AS documentId, idx, content, token_count AS tokenCount, created_at AS createdAt
    FROM chunks
    WHERE document_id = ?
    ORDER BY idx ASC
  `).all(document.id);

  response.json({
    document: toPublicDocument(document),
    chunks,
  });
});

router.patch('/:id', (request, response) => {
  const projectId = normalizeProjectId(request.body?.projectId);
  const userId = getRequestUserId(request);

  if (projectId && !getProjectById(userId, projectId)) {
    response.status(404).json({ error: 'Project not found.' });
    return;
  }

  const updated = updateDocumentProject(userId, request.params.id, projectId);

  if (!updated) {
    response.status(404).json({ error: 'Document not found.' });
    return;
  }

  const document = db.prepare('SELECT * FROM documents WHERE user_id = ? AND id = ?')
    .get(userId, request.params.id);
  response.json({ document: toPublicDocument(document) });
});

router.delete('/:id', async (request, response) => {
  const userId = getRequestUserId(request);
  const document = db.prepare('SELECT * FROM documents WHERE user_id = ? AND id = ?')
    .get(userId, request.params.id);

  if (!document) {
    response.status(404).json({ error: 'Document not found.' });
    return;
  }

  try {
    const vectorStore = await getVectorStore(userId, { accessToken: request.authToken });
    await vectorStore.clearDocumentIndex(document.id);
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : 'Unable to clear vector index.',
    });
    return;
  }

  db.transaction(() => {
    db.prepare(`
      DELETE FROM embeddings
      WHERE chunk_id IN (SELECT id FROM chunks WHERE document_id = ?)
    `).run(document.id);
    db.prepare('DELETE FROM chunks WHERE document_id = ?').run(document.id);
    db.prepare('DELETE FROM embedding_jobs WHERE document_id = ?').run(document.id);
    db.prepare('DELETE FROM documents WHERE id = ?').run(document.id);
  })();

  try {
    await unlink(getUploadPath(document.stored_filename));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      response.status(500).json({ error: error.message });
      return;
    }
  }

  response.json({ success: true });
});

export default router;
