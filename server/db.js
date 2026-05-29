import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const SERVER_DIR = __dirname;
export const UPLOAD_DIR = path.join(SERVER_DIR, 'uploads');
export const DB_PATH = path.join(SERVER_DIR, 'embedly.db');

mkdirSync(UPLOAD_DIR, { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

export const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    description TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    stored_filename TEXT NOT NULL,
    mime_type TEXT,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    error TEXT,
    chunk_count INTEGER NOT NULL DEFAULT 0,
    project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chunks (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    idx INTEGER NOT NULL,
    content TEXT NOT NULL,
    token_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS embeddings (
    id TEXT PRIMARY KEY,
    chunk_id TEXT NOT NULL,
    vector BLOB NOT NULL,
    model TEXT NOT NULL,
    dimensions INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS embedding_jobs (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    model TEXT NOT NULL,
    total_chunks INTEGER NOT NULL DEFAULT 0,
    processed_chunks INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    encrypted INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON chunks(document_id);
  CREATE INDEX IF NOT EXISTS idx_embeddings_chunk_id ON embeddings(chunk_id);
  CREATE INDEX IF NOT EXISTS idx_jobs_document_id ON embedding_jobs(document_id);
`;

export function initializeSchema(database) {
  database.pragma('foreign_keys = ON');
  database.exec(SCHEMA_SQL);
  ensureSettingsKeyConstraint(database);

  const documentColumns = database.prepare('PRAGMA table_info(documents)').all();
  const hasProjectColumn = documentColumns.some((column) => column.name === 'project_id');

  if (!hasProjectColumn) {
    database.exec('ALTER TABLE documents ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL');
  }

  database.exec('CREATE INDEX IF NOT EXISTS idx_documents_project_id ON documents(project_id)');
}

initializeSchema(db);

function hasUniqueSettingsKey(database) {
  const settingsColumns = database.prepare('PRAGMA table_info(settings)').all();
  const keyColumn = settingsColumns.find((column) => column.name === 'key');
  const primaryKeyColumns = settingsColumns.filter((column) => column.pk);

  if (keyColumn?.pk && primaryKeyColumns.length === 1) {
    return true;
  }

  const indexes = database.prepare('PRAGMA index_list(settings)').all();
  return indexes.some((index) => {
    if (!index.unique) return false;

    const indexedColumns = database.prepare(`PRAGMA index_info(${JSON.stringify(index.name)})`).all();
    return indexedColumns.length === 1 && indexedColumns[0]?.name === 'key';
  });
}

function ensureSettingsKeyConstraint(database) {
  if (hasUniqueSettingsKey(database)) {
    return;
  }

  const settingsColumns = database.prepare('PRAGMA table_info(settings)').all();
  const hasUserIdColumn = settingsColumns.some((column) => column.name === 'user_id');
  const rowOrdering = hasUserIdColumn
    ? "ORDER BY CASE WHEN user_id = '' THEN 1 ELSE 0 END ASC, updated_at ASC"
    : 'ORDER BY updated_at ASC';
  const legacyRows = database
    .prepare(`SELECT key, value, encrypted, updated_at FROM settings WHERE key IS NOT NULL ${rowOrdering}`)
    .all();

  const migrateSettings = database.transaction((rows) => {
    database.exec(`
      DROP TABLE IF EXISTS settings_migration_backup;
      ALTER TABLE settings RENAME TO settings_migration_backup;

      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        encrypted INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );
    `);

    const insertSetting = database.prepare(`
      INSERT INTO settings (key, value, encrypted, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        encrypted = excluded.encrypted,
        updated_at = excluded.updated_at
    `);

    for (const row of rows) {
      insertSetting.run(
        row.key,
        row.value ?? 'null',
        row.encrypted ? 1 : 0,
        row.updated_at || nowIso(),
      );
    }

    database.exec('DROP TABLE settings_migration_backup');
  });

  migrateSettings(legacyRows);
}

export function nowIso() {
  return new Date().toISOString();
}

export function getUploadPath(storedFilename) {
  return path.join(UPLOAD_DIR, storedFilename);
}

export function insertDocument(document) {
  const row = {
    projectId: null,
    ...document,
  };

  db.prepare(`
    INSERT INTO documents (
      id, filename, stored_filename, mime_type, size_bytes, status, error,
      chunk_count, project_id, created_at, updated_at
    )
    VALUES (
      @id, @filename, @storedFilename, @mimeType, @sizeBytes, @status, @error,
      @chunkCount, @projectId, @createdAt, @updatedAt
    )
  `).run(row);
}

export function updateDocumentStatus(id, status, error = null) {
  db.prepare(`
    UPDATE documents
    SET status = ?, error = ?, updated_at = ?
    WHERE id = ?
  `).run(status, error, nowIso(), id);
}

export function updateDocumentChunkCount(id, chunkCount) {
  db.prepare(`
    UPDATE documents
    SET chunk_count = ?, updated_at = ?
    WHERE id = ?
  `).run(chunkCount, nowIso(), id);
}

export function clearDocumentIndex(documentId) {
  db.transaction(() => {
    db.prepare(`
      DELETE FROM embeddings
      WHERE chunk_id IN (SELECT id FROM chunks WHERE document_id = ?)
    `).run(documentId);
    db.prepare('DELETE FROM chunks WHERE document_id = ?').run(documentId);
    db.prepare('DELETE FROM embedding_jobs WHERE document_id = ?').run(documentId);
    db.prepare(`
      UPDATE documents
      SET chunk_count = 0, error = NULL, updated_at = ?
      WHERE id = ?
    `).run(nowIso(), documentId);
  })();
}

export function toPublicProject(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    documentCount: Number(row.document_count ?? row.documentCount ?? 0),
    createdAt: row.created_at,
  };
}

export function listProjects() {
  return db.prepare(`
    SELECT
      projects.id,
      projects.name,
      projects.description,
      projects.created_at,
      COUNT(documents.id) AS document_count
    FROM projects
    LEFT JOIN documents ON documents.project_id = projects.id
    GROUP BY projects.id
    ORDER BY LOWER(projects.name) ASC
  `).all().map(toPublicProject);
}

export function getProjectById(id) {
  return toPublicProject(db.prepare(`
    SELECT
      projects.id,
      projects.name,
      projects.description,
      projects.created_at,
      COUNT(documents.id) AS document_count
    FROM projects
    LEFT JOIN documents ON documents.project_id = projects.id
    WHERE projects.id = ?
    GROUP BY projects.id
  `).get(id));
}

export function insertProject(project) {
  const row = {
    description: null,
    ...project,
  };

  db.prepare(`
    INSERT INTO projects (id, name, description, created_at)
    VALUES (@id, @name, @description, @createdAt)
  `).run(row);

  return getProjectById(row.id);
}

export function updateProject(id, updates) {
  const existingProject = getProjectById(id);

  if (!existingProject) {
    return null;
  }

  const name = Object.prototype.hasOwnProperty.call(updates, 'name')
    ? updates.name
    : existingProject.name;
  const description = Object.prototype.hasOwnProperty.call(updates, 'description')
    ? updates.description
    : existingProject.description;

  db.prepare(`
    UPDATE projects
    SET name = ?, description = ?
    WHERE id = ?
  `).run(name, description, id);

  return getProjectById(id);
}

export function deleteProject(id) {
  const result = db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  return result.changes > 0;
}

export function updateDocumentProject(documentId, projectId) {
  const result = db.prepare(`
    UPDATE documents
    SET project_id = ?, updated_at = ?
    WHERE id = ?
  `).run(projectId, nowIso(), documentId);

  return result.changes > 0;
}

export function getDocumentsByProject(projectId) {
  return db.prepare(`
    SELECT *
    FROM documents
    WHERE project_id = ?
    ORDER BY created_at DESC
  `).all(projectId).map(toPublicDocument);
}

export function toPublicDocument(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    filename: row.filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    status: row.status,
    error: row.error,
    chunkCount: row.chunk_count,
    projectId: row.project_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
