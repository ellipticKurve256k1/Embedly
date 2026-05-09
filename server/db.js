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

db.exec(`
  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    stored_filename TEXT NOT NULL,
    mime_type TEXT,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    error TEXT,
    chunk_count INTEGER NOT NULL DEFAULT 0,
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

  CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON chunks(document_id);
  CREATE INDEX IF NOT EXISTS idx_embeddings_chunk_id ON embeddings(chunk_id);
  CREATE INDEX IF NOT EXISTS idx_jobs_document_id ON embedding_jobs(document_id);
`);

export function nowIso() {
  return new Date().toISOString();
}

export function getUploadPath(storedFilename) {
  return path.join(UPLOAD_DIR, storedFilename);
}

export function insertDocument(document) {
  db.prepare(`
    INSERT INTO documents (
      id, filename, stored_filename, mime_type, size_bytes, status, error,
      chunk_count, created_at, updated_at
    )
    VALUES (
      @id, @filename, @storedFilename, @mimeType, @sizeBytes, @status, @error,
      @chunkCount, @createdAt, @updatedAt
    )
  `).run(document);
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
