import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import express from 'express';
import { db, nowIso } from '../db.js';
import documentsRouter from './documents.js';
import searchRouter from './search.js';
import settingsRouter from './settings.js';
import { deleteSetting, SETTINGS_KEYS } from '../services/settings.js';
import { dispatchExpress } from '../test-helpers.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok' });
  });
  app.use('/api/documents', documentsRouter);
  app.use('/api/search', searchRouter);
  app.use('/api/settings', settingsRouter);
  return app;
}

function insertRouteTestDocument(id = 'route-doc') {
  db.prepare(`
    INSERT INTO documents (
      id, filename, stored_filename, mime_type, size_bytes, status, error,
      chunk_count, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, `${id}.txt`, `${id}.txt`, 'text/plain', 10, 'pending', null, 0, nowIso(), nowIso());
}

afterEach(() => {
  db.prepare("DELETE FROM documents WHERE id LIKE 'route-%'").run();
  for (const key of Object.values(SETTINGS_KEYS)) {
    deleteSetting(key);
  }
});

test('GET /api/health returns status ok', async () => {
  const response = await dispatchExpress(createApp(), { path: '/api/health' });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { status: 'ok' });
});

test('GET /api/documents returns documents array', async () => {
  const response = await dispatchExpress(createApp(), { path: '/api/documents' });
  assert.equal(response.status, 200);
  assert.ok(Array.isArray(response.body.documents));
});

test('GET /api/documents/:id returns a document with chunks', async () => {
  insertRouteTestDocument('route-doc-get');
  const response = await dispatchExpress(createApp(), { path: '/api/documents/route-doc-get' });
  assert.equal(response.status, 200);
  assert.equal(response.body.document.id, 'route-doc-get');
  assert.ok(Array.isArray(response.body.chunks));
});

test('GET /api/documents/:id returns 404 for missing document', async () => {
  const response = await dispatchExpress(createApp(), { path: '/api/documents/missing' });
  assert.equal(response.status, 404);
  assert.match(response.body.error, /not found/i);
});

test('DELETE /api/documents/:id deletes an existing document', async () => {
  insertRouteTestDocument('route-doc-delete');
  const response = await dispatchExpress(createApp(), {
    method: 'DELETE',
    path: '/api/documents/route-doc-delete',
  });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { success: true });
});

test('DELETE /api/documents/:id returns 404 for missing document', async () => {
  const response = await dispatchExpress(createApp(), {
    method: 'DELETE',
    path: '/api/documents/missing',
  });
  assert.equal(response.status, 404);
});

test('GET /api/search rejects missing query', async () => {
  const response = await dispatchExpress(createApp(), { path: '/api/search' });
  assert.equal(response.status, 400);
  assert.match(response.body.error, /required/);
});

test('GET /api/settings returns settings object', async () => {
  const response = await dispatchExpress(createApp(), { path: '/api/settings' });
  assert.equal(response.status, 200);
  assert.equal(typeof response.body, 'object');
});

test('POST /api/settings updates embedding settings', async () => {
  const response = await dispatchExpress(createApp(), {
    method: 'POST',
    path: '/api/settings',
    body: { embedding: { provider: 'ollama', model: 'nomic' } },
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.embedding.model, 'nomic');
});

test('GET /api/settings/:key returns one public setting', async () => {
  const app = createApp();
  await dispatchExpress(app, {
    method: 'POST',
    path: '/api/settings',
    body: { vectorDb: { provider: 'sqlite' } },
  });
  const response = await dispatchExpress(app, { path: '/api/settings/vectorDb' });
  assert.deepEqual(response.body, { vectorDb: { provider: 'sqlite' } });
});

test('GET /api/settings/:key rejects unknown setting', async () => {
  const response = await dispatchExpress(createApp(), { path: '/api/settings/unknown' });
  assert.equal(response.status, 404);
});

test('DELETE /api/settings/:key deletes known setting', async () => {
  const app = createApp();
  await dispatchExpress(app, {
    method: 'POST',
    path: '/api/settings',
    body: { chunking: { strategy: 'fixed' } },
  });
  const response = await dispatchExpress(app, {
    method: 'DELETE',
    path: '/api/settings/chunking',
  });
  assert.equal(response.status, 204);
});
