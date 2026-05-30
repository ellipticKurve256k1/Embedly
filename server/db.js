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
    id TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL COLLATE NOCASE,
    description TEXT,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, id),
    UNIQUE (user_id, name)
  );

  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT '',
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

  CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    encrypted INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, key)
  );

  CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
  CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
  CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON chunks(document_id);
  CREATE INDEX IF NOT EXISTS idx_embeddings_chunk_id ON embeddings(chunk_id);
  CREATE INDEX IF NOT EXISTS idx_jobs_document_id ON embedding_jobs(document_id);
`;

export function initializeSchema(database) {
  database.pragma('foreign_keys = ON');
  database.exec(SCHEMA_SQL);
  migrateProjectsSchema(database);
  repairDocumentsSchema(database);

  const documentColumns = database.prepare('PRAGMA table_info(documents)').all();
  const hasProjectColumn = documentColumns.some((column) => column.name === 'project_id');
  const hasDocumentUserIdColumn = documentColumns.some((column) => column.name === 'user_id');

  if (!hasDocumentUserIdColumn) {
    database.exec("ALTER TABLE documents ADD COLUMN user_id TEXT NOT NULL DEFAULT ''");
  }
  if (!hasProjectColumn) {
    database.exec('ALTER TABLE documents ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL');
  }

  migrateLegacySettings(database);
  database.exec('CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_documents_project_id ON documents(project_id)');
}

initializeSchema(db);

function normalizeUserId(userId) {
  return String(userId ?? '').trim();
}

function tableExists(database, tableName) {
  return Boolean(database.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name = ?
  `).get(tableName));
}

function migrateProjectsSchema(database) {
  const projectColumns = database.prepare('PRAGMA table_info(projects)').all();
  const hasUserIdColumn = projectColumns.some((column) => column.name === 'user_id');
  const primaryKeyColumns = projectColumns
    .filter((column) => column.pk)
    .sort((a, b) => a.pk - b.pk)
    .map((column) => column.name);
  const hasCompositePrimaryKey = primaryKeyColumns.length === 2
    && primaryKeyColumns[0] === 'user_id'
    && primaryKeyColumns[1] === 'id';

  if (hasUserIdColumn && hasCompositePrimaryKey) {
    return;
  }

  const copyUserId = hasUserIdColumn ? "COALESCE(user_id, '')" : "''";
  database.pragma('foreign_keys = OFF');
  try {
    database.exec(`
      ALTER TABLE projects RENAME TO projects_migration_backup;

      CREATE TABLE projects (
        id TEXT NOT NULL UNIQUE,
        user_id TEXT NOT NULL DEFAULT '',
        name TEXT NOT NULL COLLATE NOCASE,
        description TEXT,
        created_at TEXT NOT NULL,
        PRIMARY KEY (user_id, id),
        UNIQUE (user_id, name)
      );

      INSERT OR IGNORE INTO projects (id, user_id, name, description, created_at)
      SELECT id, ${copyUserId}, name, description, created_at
      FROM projects_migration_backup;

      DROP TABLE projects_migration_backup;
    `);
  } finally {
    database.pragma('foreign_keys = ON');
  }
}

function repairDocumentsSchema(database) {
  const documentColumns = database.prepare('PRAGMA table_info(documents)').all();
  const hasUserIdColumn = documentColumns.some((column) => column.name === 'user_id');
  const hasProjectColumn = documentColumns.some((column) => column.name === 'project_id');
  const foreignKeys = database.prepare('PRAGMA foreign_key_list(documents)').all();
  const projectForeignKey = foreignKeys.find((foreignKey) => foreignKey.from === 'project_id');
  const needsForeignKeyRepair = hasProjectColumn
    && projectForeignKey
    && projectForeignKey.table !== 'projects';

  if (hasUserIdColumn && !needsForeignKeyRepair) {
    return;
  }

  const userIdExpression = hasUserIdColumn ? "COALESCE(user_id, '')" : "''";
  const projectIdExpression = hasProjectColumn ? 'project_id' : 'NULL';
  database.pragma('foreign_keys = OFF');
  try {
    database.exec(`
      CREATE TABLE documents_migration_next (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL DEFAULT '',
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

      INSERT INTO documents_migration_next (
        id, user_id, filename, stored_filename, mime_type, size_bytes, status, error,
        chunk_count, project_id, created_at, updated_at
      )
      SELECT
        id, ${userIdExpression}, filename, stored_filename, mime_type, size_bytes, status, error,
        chunk_count, ${projectIdExpression}, created_at, updated_at
      FROM documents;

      DROP TABLE documents;
      ALTER TABLE documents_migration_next RENAME TO documents;
    `);
  } finally {
    database.pragma('foreign_keys = ON');
  }
}

function migrateLegacySettings(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      encrypted INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, key)
    )
  `);

  if (!tableExists(database, 'settings')) {
    return;
  }

  const existingCount = database.prepare('SELECT COUNT(*) AS count FROM user_settings').get().count;
  if (existingCount === 0) {
    const settingsColumns = database.prepare('PRAGMA table_info(settings)').all();
    const hasUserIdColumn = settingsColumns.some((column) => column.name === 'user_id');
    const userIdExpression = hasUserIdColumn ? "COALESCE(user_id, '')" : "''";

    database.exec(`
      INSERT OR REPLACE INTO user_settings (user_id, key, value, encrypted, updated_at)
      SELECT ${userIdExpression}, key, value, encrypted, updated_at
      FROM settings
      WHERE key IS NOT NULL
    `);
  }

  database.exec('DROP TABLE IF EXISTS settings');
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
    userId: '',
    ...document,
    userId: normalizeUserId(document.userId),
  };

  db.prepare(`
    INSERT INTO documents (
      id, user_id, filename, stored_filename, mime_type, size_bytes, status, error,
      chunk_count, project_id, created_at, updated_at
    )
    VALUES (
      @id, @userId, @filename, @storedFilename, @mimeType, @sizeBytes, @status, @error,
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

export function listProjects(userId = '') {
  const normalizedUserId = normalizeUserId(userId);
  return db.prepare(`
    SELECT
      projects.id,
      projects.name,
      projects.description,
      projects.created_at,
      COUNT(documents.id) AS document_count
    FROM projects
    LEFT JOIN documents ON documents.project_id = projects.id
      AND documents.user_id = projects.user_id
    WHERE projects.user_id = ?
    GROUP BY projects.id
    ORDER BY LOWER(projects.name) ASC
  `).all(normalizedUserId).map(toPublicProject);
}

export function getProjectById(userId, id) {
  const normalizedUserId = normalizeUserId(userId);
  return toPublicProject(db.prepare(`
    SELECT
      projects.id,
      projects.name,
      projects.description,
      projects.created_at,
      COUNT(documents.id) AS document_count
    FROM projects
    LEFT JOIN documents ON documents.project_id = projects.id
      AND documents.user_id = projects.user_id
    WHERE projects.user_id = ? AND projects.id = ?
    GROUP BY projects.id
  `).get(normalizedUserId, id));
}

export function insertProject(project) {
  const row = {
    description: null,
    userId: '',
    ...project,
    userId: normalizeUserId(project.userId),
  };

  db.prepare(`
    INSERT INTO projects (id, user_id, name, description, created_at)
    VALUES (@id, @userId, @name, @description, @createdAt)
  `).run(row);

  return getProjectById(row.userId, row.id);
}

export function updateProject(userId, id, updates) {
  const normalizedUserId = normalizeUserId(userId);
  const existingProject = getProjectById(normalizedUserId, id);

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
    WHERE user_id = ? AND id = ?
  `).run(name, description, normalizedUserId, id);

  return getProjectById(normalizedUserId, id);
}

export function deleteProject(userId, id) {
  const result = db.prepare('DELETE FROM projects WHERE user_id = ? AND id = ?')
    .run(normalizeUserId(userId), id);
  return result.changes > 0;
}

export function updateDocumentProject(userId, documentId, projectId) {
  const normalizedUserId = normalizeUserId(userId);
  const result = db.prepare(`
    UPDATE documents
    SET project_id = ?, updated_at = ?
    WHERE user_id = ? AND id = ?
  `).run(projectId, nowIso(), normalizedUserId, documentId);

  return result.changes > 0;
}

export function getDocumentsByProject(userId, projectId) {
  return db.prepare(`
    SELECT *
    FROM documents
    WHERE user_id = ? AND project_id = ?
    ORDER BY created_at DESC
  `).all(normalizeUserId(userId), projectId).map(toPublicDocument);
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
