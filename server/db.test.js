import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import {
  initializeSchema,
  nowIso,
  SCHEMA_SQL,
  toPublicDocument,
} from './db.js';
import { vectorToBlob, blobToVector } from './services/embedder.js';

function createMemoryDb() {
  const database = new Database(':memory:');
  initializeSchema(database);
  return database;
}

function insertDocument(database, id = 'doc-1') {
  database.prepare(`
    INSERT INTO documents (
      id, filename, stored_filename, mime_type, size_bytes, status, error,
      chunk_count, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, 'notes.txt', 'stored-notes.txt', 'text/plain', 12, 'pending', null, 0, nowIso(), nowIso());
}

test('SCHEMA_SQL includes all core tables', () => {
  for (const tableName of ['projects', 'documents', 'chunks', 'embeddings', 'embedding_jobs', 'user_settings']) {
    assert.match(SCHEMA_SQL, new RegExp(`CREATE TABLE IF NOT EXISTS ${tableName}`));
  }
});

test('initializeSchema creates documents table', () => {
  const database = createMemoryDb();
  const row = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'documents'").get();
  assert.equal(row.name, 'documents');
  database.close();
});

test('initializeSchema creates user_settings table', () => {
  const database = createMemoryDb();
  const row = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'user_settings'").get();
  assert.equal(row.name, 'user_settings');
  database.close();
});

test('initializeSchema creates projects table', () => {
  const database = createMemoryDb();
  const row = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'projects'").get();
  assert.equal(row.name, 'projects');
  database.close();
});

test('documents can be inserted and selected', () => {
  const database = createMemoryDb();
  insertDocument(database);
  const row = database.prepare('SELECT * FROM documents WHERE id = ?').get('doc-1');
  assert.equal(row.filename, 'notes.txt');
  assert.equal(row.user_id, '');
  database.close();
});

test('initializeSchema creates user ownership columns', () => {
  const database = createMemoryDb();
  const projectColumns = database.prepare('PRAGMA table_info(projects)').all();
  const documentColumns = database.prepare('PRAGMA table_info(documents)').all();

  assert.ok(projectColumns.some((column) => column.name === 'user_id'));
  assert.ok(documentColumns.some((column) => column.name === 'user_id'));
  database.close();
});

test('toPublicDocument maps database row to public shape', () => {
  const row = {
    id: '1',
    filename: 'a.txt',
    mime_type: 'text/plain',
    size_bytes: 10,
    status: 'ready',
    error: null,
    chunk_count: 2,
    created_at: 'c',
    updated_at: 'u',
  };

  assert.deepEqual(toPublicDocument(row), {
    id: '1',
    filename: 'a.txt',
    mimeType: 'text/plain',
    sizeBytes: 10,
    status: 'ready',
    error: null,
    chunkCount: 2,
    projectId: null,
    createdAt: 'c',
    updatedAt: 'u',
  });
});

test('toPublicDocument returns null for missing row', () => {
  assert.equal(toPublicDocument(null), null);
});

test('chunks cascade when document is deleted', () => {
  const database = createMemoryDb();
  insertDocument(database);
  database.prepare('INSERT INTO chunks (id, document_id, idx, content, token_count, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run('chunk-1', 'doc-1', 0, 'hello', 1, nowIso());
  database.prepare('DELETE FROM documents WHERE id = ?').run('doc-1');
  const count = database.prepare('SELECT COUNT(*) AS count FROM chunks').get().count;
  assert.equal(count, 0);
  database.close();
});

test('embeddings store and recover vectors', () => {
  const database = createMemoryDb();
  insertDocument(database);
  database.prepare('INSERT INTO chunks (id, document_id, idx, content, token_count, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run('chunk-1', 'doc-1', 0, 'hello', 1, nowIso());
  database.prepare('INSERT INTO embeddings (id, chunk_id, vector, model, dimensions, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run('emb-1', 'chunk-1', vectorToBlob([1, 2, 3]), 'model', 3, nowIso());
  const row = database.prepare('SELECT vector FROM embeddings WHERE id = ?').get('emb-1');
  assert.deepEqual(Array.from(blobToVector(row.vector)), [1, 2, 3]);
  database.close();
});

test('embedding jobs can be inserted and updated', () => {
  const database = createMemoryDb();
  insertDocument(database);
  database.prepare('INSERT INTO embedding_jobs (id, document_id, status, model, total_chunks, processed_chunks, error, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run('job-1', 'doc-1', 'pending', 'model', 2, 0, null, nowIso(), nowIso());
  database.prepare('UPDATE embedding_jobs SET status = ?, processed_chunks = ? WHERE id = ?').run('completed', 2, 'job-1');
  const row = database.prepare('SELECT status, processed_chunks FROM embedding_jobs WHERE id = ?').get('job-1');
  assert.deepEqual(row, { status: 'completed', processed_chunks: 2 });
  database.close();
});

test('user settings can be inserted and updated', () => {
  const database = createMemoryDb();
  database.prepare('INSERT INTO user_settings (user_id, key, value, encrypted, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run('user-1', 'chunking.config', '{"strategy":"fixed"}', 0, nowIso());
  database.prepare('UPDATE user_settings SET value = ? WHERE user_id = ? AND key = ?')
    .run('{"strategy":"recursive"}', 'user-1', 'chunking.config');
  const row = database.prepare('SELECT value, encrypted FROM user_settings WHERE user_id = ? AND key = ?')
    .get('user-1', 'chunking.config');
  assert.deepEqual(row, { value: '{"strategy":"recursive"}', encrypted: 0 });
  database.close();
});

test('initializeSchema migrates legacy settings into user_settings', () => {
  const database = new Database(':memory:');
  database.exec(`
    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      encrypted INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    )
  `);
  database.prepare('INSERT INTO settings (key, value, encrypted, updated_at) VALUES (?, ?, ?, ?)')
    .run('embedding.setup', '{"model":"global"}', 0, '2026-01-01T00:00:00.000Z');

  initializeSchema(database);

  const settingsTable = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'settings'").get();
  assert.equal(settingsTable, undefined);
  const row = database.prepare('SELECT user_id, value, encrypted FROM user_settings WHERE key = ?')
    .get('embedding.setup');
  assert.deepEqual(row, { user_id: '', value: '{"model":"global"}', encrypted: 0 });
  database.close();
});

test('projects allow duplicate names across users', () => {
  const database = createMemoryDb();
  database.prepare('INSERT INTO projects (id, user_id, name, description, created_at) VALUES (?, ?, ?, ?, ?)')
    .run('project-1', 'user-1', 'Shared Name', null, nowIso());
  database.prepare('INSERT INTO projects (id, user_id, name, description, created_at) VALUES (?, ?, ?, ?, ?)')
    .run('project-2', 'user-2', 'Shared Name', null, nowIso());

  const count = database.prepare('SELECT COUNT(*) AS count FROM projects WHERE name = ?')
    .get('Shared Name').count;
  assert.equal(count, 2);
  database.close();
});

test('deleting a project unassigns documents', () => {
  const database = createMemoryDb();
  database.prepare('INSERT INTO projects (id, user_id, name, description, created_at) VALUES (?, ?, ?, ?, ?)')
    .run('project-1', '', 'Project One', null, nowIso());
  insertDocument(database);
  database.prepare('UPDATE documents SET project_id = ? WHERE id = ?').run('project-1', 'doc-1');
  database.prepare('DELETE FROM projects WHERE id = ?').run('project-1');
  const row = database.prepare('SELECT project_id FROM documents WHERE id = ?').get('doc-1');
  assert.equal(row.project_id, null);
  database.close();
});

test('foreign key constraints reject chunks for missing documents', () => {
  const database = createMemoryDb();
  assert.throws(
    () => database.prepare('INSERT INTO chunks (id, document_id, idx, content, token_count, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run('chunk-1', 'missing', 0, 'hello', 1, nowIso()),
    /FOREIGN KEY constraint failed/,
  );
  database.close();
});
