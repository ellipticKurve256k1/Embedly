import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import express from 'express';
import { db, nowIso } from '../db.js';
import documentsRouter from './documents.js';
import embedRouter from './embed.js';
import projectsRouter from './projects.js';
import searchRouter from './search.js';
import settingsRouter from './settings.js';
import vectorDbRouter from './vectorDb.js';
import { deleteSetting, SETTINGS_KEYS } from '../services/settings.js';
import { dispatchExpress } from '../test-helpers.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok' });
  });
  app.use('/api/documents', documentsRouter);
  app.use('/api/embed', embedRouter);
  app.use('/api/projects', projectsRouter);
  app.use('/api/search', searchRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/vector-db', vectorDbRouter);
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

function insertRouteTestProject(id = 'route-project') {
  db.prepare(`
    INSERT INTO projects (id, name, description, created_at)
    VALUES (?, ?, ?, ?)
  `).run(id, `${id} name`, null, nowIso());
}

afterEach(() => {
  db.prepare("DELETE FROM documents WHERE id LIKE 'route-%'").run();
  db.prepare("DELETE FROM projects WHERE id LIKE 'route-%'").run();
  db.prepare("DELETE FROM projects WHERE name LIKE 'route-%'").run();
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

test('GET /api/embed/status returns queue status', async () => {
  const response = await dispatchExpress(createApp(), { path: '/api/embed/status' });

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(response.body.activeJobs));
  assert.ok(Number.isInteger(response.body.queueLength));
});

test('POST /api/projects creates a project', async () => {
  const response = await dispatchExpress(createApp(), {
    method: 'POST',
    path: '/api/projects',
    body: { name: 'route-project-created', description: 'docs' },
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.project.name, 'route-project-created');
  assert.equal(response.body.project.documentCount, 0);
});

test('GET /api/projects returns project document counts', async () => {
  insertRouteTestProject('route-project-list');
  insertRouteTestDocument('route-doc-project-list');
  db.prepare('UPDATE documents SET project_id = ? WHERE id = ?')
    .run('route-project-list', 'route-doc-project-list');

  const response = await dispatchExpress(createApp(), { path: '/api/projects' });

  assert.equal(response.status, 200);
  const project = response.body.projects.find((item) => item.id === 'route-project-list');
  assert.equal(project.documentCount, 1);
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

test('PATCH /api/documents/:id assigns a project', async () => {
  insertRouteTestProject('route-project-assign');
  insertRouteTestDocument('route-doc-assign');

  const response = await dispatchExpress(createApp(), {
    method: 'PATCH',
    path: '/api/documents/route-doc-assign',
    body: { projectId: 'route-project-assign' },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.document.projectId, 'route-project-assign');
});

test('GET /api/documents filters by projectId', async () => {
  insertRouteTestProject('route-project-filter');
  insertRouteTestDocument('route-doc-filter-match');
  insertRouteTestDocument('route-doc-filter-other');
  db.prepare('UPDATE documents SET project_id = ? WHERE id = ?')
    .run('route-project-filter', 'route-doc-filter-match');

  const response = await dispatchExpress(createApp(), {
    path: '/api/documents?projectId=route-project-filter',
  });

  assert.equal(response.status, 200);
  assert.deepEqual(
    response.body.documents.map((document) => document.id),
    ['route-doc-filter-match'],
  );
});

test('DELETE /api/projects/:id unassigns documents', async () => {
  insertRouteTestProject('route-project-delete');
  insertRouteTestDocument('route-doc-project-delete');
  db.prepare('UPDATE documents SET project_id = ? WHERE id = ?')
    .run('route-project-delete', 'route-doc-project-delete');

  const response = await dispatchExpress(createApp(), {
    method: 'DELETE',
    path: '/api/projects/route-project-delete',
  });
  const document = db.prepare('SELECT project_id FROM documents WHERE id = ?')
    .get('route-doc-project-delete');

  assert.equal(response.status, 200);
  assert.equal(document.project_id, null);
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
  assert.deepEqual(response.body, { vectorDb: { provider: 'sqlite', name: 'SQLite' } });
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

test('POST /api/vector-db/test-connection accepts SQLite provider', async () => {
  const response = await dispatchExpress(createApp(), {
    method: 'POST',
    path: '/api/vector-db/test-connection',
    body: { provider: 'sqlite' },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
});

test('POST /api/vector-db/test-connection rejects incomplete Supabase setup', async () => {
  const response = await dispatchExpress(createApp(), {
    method: 'POST',
    path: '/api/vector-db/test-connection',
    body: { provider: 'supabase', projectUrl: 'https://test.supabase.co' },
  });

  assert.equal(response.status, 400);
  assert.match(response.body.error, /service role key/i);
});
