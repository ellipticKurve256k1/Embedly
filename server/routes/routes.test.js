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
import {
  deleteSetting,
  setSettingsSupabaseClientFactoryForTests,
  SETTINGS_KEYS,
} from '../services/settings.js';
import { dispatchExpress } from '../test-helpers.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((request, _response, next) => {
    const userId = request.get?.('x-test-user-id');
    if (userId) {
      request.userId = userId;
      request.authToken = `token-for-${userId}`;
    }
    next();
  });
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

function insertRouteTestDocument(id = 'route-doc', userId = '') {
  db.prepare(`
    INSERT INTO documents (
      id, user_id, filename, stored_filename, mime_type, size_bytes, status, error,
      chunk_count, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, `${id}.txt`, `${id}.txt`, 'text/plain', 10, 'pending', null, 0, nowIso(), nowIso());
}

function insertRouteTestProject(id = 'route-project', userId = '') {
  db.prepare(`
    INSERT INTO projects (id, user_id, name, description, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, userId, `${id} name`, null, nowIso());
}

function createMockSettingsClient(rows = []) {
  return {
    rows,
    from(table) {
      return {
        select() {
          const filters = {};
          return {
            eq(column, value) {
              filters[column] = value;
              return this;
            },
            maybeSingle() {
              const row = rows.find((item) => (
                Object.entries(filters).every(([key, value]) => item[key] === value)
              ));
              return Promise.resolve({ data: row ?? null, error: null });
            },
            then(resolve) {
              const matchedRows = rows.filter((item) => (
                Object.entries(filters).every(([key, value]) => item[key] === value)
              ));
              return Promise.resolve({ data: matchedRows, error: null }).then(resolve);
            },
          };
        },
        upsert(value) {
          const values = Array.isArray(value) ? value : [value];
          for (const nextRow of values) {
            const index = rows.findIndex((row) => (
              row.user_id === nextRow.user_id && row.key === nextRow.key
            ));
            if (index >= 0) {
              rows[index] = { ...rows[index], ...nextRow };
            } else {
              rows.push(nextRow);
            }
          }
          return Promise.resolve({ data: null, error: null });
        },
        delete() {
          const filters = {};
          const chain = {
            eq(column, value) {
              filters[column] = value;
              return chain;
            },
            then(resolve) {
              for (let index = rows.length - 1; index >= 0; index -= 1) {
                if (Object.entries(filters).every(([key, value]) => rows[index][key] === value)) {
                  rows.splice(index, 1);
                }
              }
              return Promise.resolve({ data: null, error: null }).then(resolve);
            },
          };
          return chain;
        },
      };
    },
  };
}

afterEach(async () => {
  setSettingsSupabaseClientFactoryForTests(null);
  db.prepare("DELETE FROM documents WHERE id LIKE 'route-%'").run();
  db.prepare("DELETE FROM projects WHERE id LIKE 'route-%'").run();
  db.prepare("DELETE FROM projects WHERE name LIKE 'route-%'").run();
  for (const userId of ['', 'route-user-a', 'route-user-b']) {
    for (const key of Object.values(SETTINGS_KEYS)) {
      await deleteSetting(userId, key);
    }
  }
});

test('GET /api/health returns status ok', async () => {
  const response = await dispatchExpress(createApp(), { path: '/api/health' });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { status: 'ok' });
});

test('GET /api/documents returns documents array', async () => {
  insertRouteTestDocument('route-doc-owned', 'route-user-a');
  insertRouteTestDocument('route-doc-other', 'route-user-b');
  const response = await dispatchExpress(createApp(), {
    path: '/api/documents',
    headers: { 'x-test-user-id': 'route-user-a' },
  });
  assert.equal(response.status, 200);
  assert.ok(Array.isArray(response.body.documents));
  assert.deepEqual(response.body.documents.map((document) => document.id), ['route-doc-owned']);
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
  insertRouteTestProject('route-project-list', 'route-user-a');
  insertRouteTestDocument('route-doc-project-list', 'route-user-a');
  db.prepare('UPDATE documents SET project_id = ? WHERE id = ?')
    .run('route-project-list', 'route-doc-project-list');

  const response = await dispatchExpress(createApp(), {
    path: '/api/projects',
    headers: { 'x-test-user-id': 'route-user-a' },
  });

  assert.equal(response.status, 200);
  const project = response.body.projects.find((item) => item.id === 'route-project-list');
  assert.equal(project.documentCount, 1);
});

test('GET /api/documents/:id returns a document with chunks', async () => {
  insertRouteTestDocument('route-doc-get', 'route-user-a');
  const response = await dispatchExpress(createApp(), {
    path: '/api/documents/route-doc-get',
    headers: { 'x-test-user-id': 'route-user-a' },
  });
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
  insertRouteTestProject('route-project-assign', 'route-user-a');
  insertRouteTestDocument('route-doc-assign', 'route-user-a');

  const response = await dispatchExpress(createApp(), {
    method: 'PATCH',
    path: '/api/documents/route-doc-assign',
    headers: { 'x-test-user-id': 'route-user-a' },
    body: { projectId: 'route-project-assign' },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.document.projectId, 'route-project-assign');
});

test('GET /api/documents filters by projectId', async () => {
  insertRouteTestProject('route-project-filter', 'route-user-a');
  insertRouteTestDocument('route-doc-filter-match', 'route-user-a');
  insertRouteTestDocument('route-doc-filter-other', 'route-user-a');
  db.prepare('UPDATE documents SET project_id = ? WHERE id = ?')
    .run('route-project-filter', 'route-doc-filter-match');

  const response = await dispatchExpress(createApp(), {
    path: '/api/documents?projectId=route-project-filter',
    headers: { 'x-test-user-id': 'route-user-a' },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(
    response.body.documents.map((document) => document.id),
    ['route-doc-filter-match'],
  );
});

test('DELETE /api/projects/:id unassigns documents', async () => {
  insertRouteTestProject('route-project-delete', 'route-user-a');
  insertRouteTestDocument('route-doc-project-delete', 'route-user-a');
  db.prepare('UPDATE documents SET project_id = ? WHERE id = ?')
    .run('route-project-delete', 'route-doc-project-delete');

  const response = await dispatchExpress(createApp(), {
    method: 'DELETE',
    path: '/api/projects/route-project-delete',
    headers: { 'x-test-user-id': 'route-user-a' },
  });
  const document = db.prepare('SELECT project_id FROM documents WHERE id = ?')
    .get('route-doc-project-delete');

  assert.equal(response.status, 200);
  assert.equal(document.project_id, null);
});

test('DELETE /api/documents/:id deletes an existing document', async () => {
  insertRouteTestDocument('route-doc-delete', 'route-user-a');
  const response = await dispatchExpress(createApp(), {
    method: 'DELETE',
    path: '/api/documents/route-doc-delete',
    headers: { 'x-test-user-id': 'route-user-a' },
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
    headers: { 'x-test-user-id': 'route-user-a' },
    body: { embedding: { provider: 'ollama', model: 'nomic' } },
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.embedding.model, 'nomic');
});

test('POST /api/settings writes authenticated settings to Supabase', async () => {
  const rows = [];
  setSettingsSupabaseClientFactoryForTests(() => createMockSettingsClient(rows));

  const response = await dispatchExpress(createApp(), {
    method: 'POST',
    path: '/api/settings',
    headers: { 'x-test-user-id': 'route-user-a' },
    body: { embedding: { provider: 'ollama', model: 'remote-nomic' } },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.embedding.model, 'remote-nomic');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].user_id, 'route-user-a');
  assert.equal(rows[0].key, SETTINGS_KEYS.embedding);
  assert.equal(
    db.prepare('SELECT COUNT(*) AS count FROM user_settings WHERE user_id = ?').get('route-user-a').count,
    0,
  );
});

test('GET /api/settings/:key returns one public setting', async () => {
  const app = createApp();
  await dispatchExpress(app, {
    method: 'POST',
    path: '/api/settings',
    headers: { 'x-test-user-id': 'route-user-a' },
    body: { vectorDb: { provider: 'sqlite' } },
  });
  const response = await dispatchExpress(app, {
    path: '/api/settings/vectorDb',
    headers: { 'x-test-user-id': 'route-user-a' },
  });
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
    headers: { 'x-test-user-id': 'route-user-a' },
    body: { chunking: { strategy: 'fixed' } },
  });
  const response = await dispatchExpress(app, {
    method: 'DELETE',
    path: '/api/settings/chunking',
    headers: { 'x-test-user-id': 'route-user-a' },
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

test('POST /api/vector-db/test-connection rejects Supabase when env is missing', async () => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousAnonKey = process.env.SUPABASE_ANON_KEY;
  const previousViteUrl = process.env.VITE_SUPABASE_URL;
  const previousViteAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  const restoreEnv = (key, value) => {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  };
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
  delete process.env.VITE_SUPABASE_URL;
  delete process.env.VITE_SUPABASE_ANON_KEY;

  let response;
  try {
    response = await dispatchExpress(createApp(), {
      method: 'POST',
      path: '/api/vector-db/test-connection',
      body: { provider: 'supabase' },
    });
  } finally {
    restoreEnv('SUPABASE_URL', previousUrl);
    restoreEnv('SUPABASE_ANON_KEY', previousAnonKey);
    restoreEnv('VITE_SUPABASE_URL', previousViteUrl);
    restoreEnv('VITE_SUPABASE_ANON_KEY', previousViteAnonKey);
  }

  assert.equal(response.status, 400);
  assert.match(response.body.error, /SUPABASE_URL/i);
});
