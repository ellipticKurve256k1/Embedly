import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { v4 as uuidv4 } from 'uuid';
import { db, nowIso } from '../../db.js';
import { vectorToBlob } from '../embedder.js';
import { createSqliteVectorStore } from './sqliteVectorStore.js';

afterEach(() => {
  db.prepare("DELETE FROM documents WHERE id LIKE 'sqlite-store-%'").run();
});

test('sqlite vector store retrieves ranked public chunks', async () => {
  const documentId = 'sqlite-store-doc';
  const chunkId = 'sqlite-store-chunk';

  db.prepare(`
    INSERT INTO documents (
      id, filename, stored_filename, mime_type, size_bytes, status, error,
      chunk_count, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(documentId, 'doc.txt', 'doc.txt', 'text/plain', 10, 'completed', null, 1, nowIso(), nowIso());
  db.prepare(`
    INSERT INTO chunks (id, document_id, idx, content, token_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(chunkId, documentId, 0, 'content', 1, nowIso());
  db.prepare(`
    INSERT INTO embeddings (id, chunk_id, vector, model, dimensions, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), chunkId, vectorToBlob([1, 0, 0]), 'test-model', 3, nowIso());

  const store = createSqliteVectorStore();
  const results = await store.retrieveChunks({
    queryVector: new Float32Array([1, 0, 0]),
    model: 'test-model',
    limit: 1,
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].chunkId, chunkId);
  assert.equal(results[0].score, 1);
});
