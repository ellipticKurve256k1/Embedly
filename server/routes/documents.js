import express from 'express';
import { unlink } from 'node:fs/promises';
import {
  db,
  getUploadPath,
  toPublicDocument,
} from '../db.js';

const router = express.Router();

router.get('/', (_request, response) => {
  const rows = db.prepare(`
    SELECT *
    FROM documents
    ORDER BY created_at DESC
  `).all();

  response.json({ documents: rows.map(toPublicDocument) });
});

router.get('/:id', (request, response) => {
  const document = db.prepare('SELECT * FROM documents WHERE id = ?').get(request.params.id);

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

router.delete('/:id', async (request, response) => {
  const document = db.prepare('SELECT * FROM documents WHERE id = ?').get(request.params.id);

  if (!document) {
    response.status(404).json({ error: 'Document not found.' });
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
