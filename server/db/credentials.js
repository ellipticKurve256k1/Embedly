import Database from 'better-sqlite3';
import path from 'node:path';
import { SERVER_DIR, nowIso } from '../db.js';

export const CREDENTIAL_DB_PATH = path.join(SERVER_DIR, 'cred.sqlite');

export const credentialDb = new Database(CREDENTIAL_DB_PATH);
credentialDb.pragma('foreign_keys = ON');

export const CREDENTIAL_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    encrypted INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, key),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);
`;

export function initializeCredentialSchema(database) {
  database.pragma('foreign_keys = ON');
  database.exec(CREDENTIAL_SCHEMA_SQL);
}

initializeCredentialSchema(credentialDb);

export function ensureCredentialUser(userId) {
  const normalizedUserId = String(userId ?? '').trim().toLowerCase();

  if (!normalizedUserId) {
    throw new Error('User ID is required.');
  }

  credentialDb.prepare(`
    INSERT INTO users (id, created_at)
    VALUES (?, ?)
    ON CONFLICT(id) DO NOTHING
  `).run(normalizedUserId, nowIso());

  return normalizedUserId;
}

export function createCredentialSession({ sessionId, userId, expiresAt }) {
  ensureCredentialUser(userId);

  credentialDb.prepare(`
    INSERT INTO sessions (id, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).run(sessionId, userId, expiresAt, nowIso());
}

export function getCredentialSession(sessionId) {
  return credentialDb.prepare(`
    SELECT id, user_id, expires_at
    FROM sessions
    WHERE id = ?
  `).get(sessionId);
}

export function deleteCredentialSession(sessionId) {
  credentialDb.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

export function deleteExpiredCredentialSessions() {
  credentialDb.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(nowIso());
}

export function getUserSettingRow(userId, storageKey) {
  return credentialDb.prepare(`
    SELECT value, encrypted
    FROM user_settings
    WHERE user_id = ? AND key = ?
  `).get(userId, storageKey);
}

export function getAllUserSettingRows(userId) {
  return credentialDb.prepare(`
    SELECT key, value, encrypted
    FROM user_settings
    WHERE user_id = ?
  `).all(userId);
}

export function setUserSettingRow(userId, storageKey, storedValue, encrypted) {
  ensureCredentialUser(userId);

  credentialDb.prepare(`
    INSERT INTO user_settings (user_id, key, value, encrypted, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, key) DO UPDATE SET
      value = excluded.value,
      encrypted = excluded.encrypted,
      updated_at = excluded.updated_at
  `).run(userId, storageKey, storedValue, encrypted, nowIso());
}

export function deleteUserSettingRow(userId, storageKey) {
  credentialDb.prepare(`
    DELETE FROM user_settings
    WHERE user_id = ? AND key = ?
  `).run(userId, storageKey);
}
