import crypto from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { db, nowIso, SERVER_DIR } from '../db.js';
import {
  deleteUserSettingRow,
  getAllUserSettingRows,
  getUserSettingRow,
  setUserSettingRow,
} from '../db/credentials.js';
import { DEFAULT_RERANKER_CONFIG } from './reranker.js';

export const SETTINGS_KEYS = {
  llm: 'llm.setup',
  embedding: 'embedding.setup',
  chunking: 'chunking.config',
  vectorDb: 'vector_db.setup',
  reranker: 'reranker.setup',
};

const PUBLIC_SETTING_KEYS = new Map(
  Object.entries(SETTINGS_KEYS).map(([publicKey, storageKey]) => [publicKey, storageKey]),
);
const STORAGE_TO_PUBLIC_KEYS = new Map(
  Object.entries(SETTINGS_KEYS).map(([publicKey, storageKey]) => [storageKey, publicKey]),
);
const KEY_DIR = path.join(SERVER_DIR, '.embeddly');
const KEY_PATH = path.join(KEY_DIR, 'key');
const MASKED_API_KEY_PATTERN = /^.{1,7}\.\.\..{1,3}$/;

let cachedEncryptionKey = null;

export function resolveEncryptionKey() {
  if (cachedEncryptionKey) {
    return cachedEncryptionKey;
  }

  const envKey = process.env.EMBEDDLY_ENCRYPTION_KEY;
  if (envKey) {
    cachedEncryptionKey = crypto.createHash('sha256').update(envKey).digest();
    return cachedEncryptionKey;
  }

  mkdirSync(KEY_DIR, { recursive: true });

  if (!existsSync(KEY_PATH)) {
    writeFileSync(KEY_PATH, crypto.randomBytes(32).toString('base64'), {
      encoding: 'utf8',
      mode: 0o600,
    });
  }

  const storedKey = readFileSync(KEY_PATH, 'utf8').trim();
  const decodedKey = Buffer.from(storedKey, 'base64');

  cachedEncryptionKey = decodedKey.length === 32
    ? decodedKey
    : crypto.createHash('sha256').update(storedKey).digest();
  return cachedEncryptionKey;
}

function encryptSetting(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', resolveEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

function decryptSetting(ciphertext) {
  const payload = Buffer.from(ciphertext, 'base64');
  const iv = payload.subarray(0, 12);
  const authTag = payload.subarray(12, 28);
  const encrypted = payload.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', resolveEncryptionKey(), iv);

  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

function shouldEncryptSetting(value) {
  return Boolean(
    value
      && typeof value === 'object'
      && !Array.isArray(value)
      && (
        Object.prototype.hasOwnProperty.call(value, 'apiKey')
        || Object.prototype.hasOwnProperty.call(value, 'serviceRoleKey')
      ),
  );
}

function parseSettingValue(row) {
  if (!row) {
    return null;
  }

  try {
    const json = row.encrypted ? decryptSetting(row.value) : row.value;
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function maskApiKey(apiKey) {
  const value = String(apiKey ?? '').trim();
  if (!value) {
    return '';
  }

  if (value.length <= 10) {
    return `${value.slice(0, 2)}...${value.slice(-2)}`;
  }

  return `${value.slice(0, 7)}...${value.slice(-3)}`;
}

export function isMaskedApiKey(apiKey) {
  return MASKED_API_KEY_PATTERN.test(String(apiKey ?? '').trim());
}

function toPublicSetting(publicKey, value) {
  if (!value || typeof value !== 'object') {
    return value;
  }

  if (publicKey === 'llm') {
    const apiKey = String(value.apiKey ?? '').trim();
    if (!apiKey) {
      return value;
    }

    return {
      ...value,
      apiKey: maskApiKey(apiKey),
      hasApiKey: true,
    };
  }

  if (publicKey === 'vectorDb' && value.provider === 'supabase') {
    const serviceRoleKey = String(value.serviceRoleKey ?? '').trim();
    if (!serviceRoleKey) {
      return value;
    }

    return {
      ...value,
      serviceRoleKey: maskApiKey(serviceRoleKey),
      hasServiceRoleKey: true,
    };
  }

  return value;
}

function normalizeLlmSetup(value, userId) {
  const input = value && typeof value === 'object' ? value : {};
  const provider = input.provider === 'api' ? 'api' : 'ollama';
  const setup = {
    provider,
    model: String(input.model ?? '').trim(),
    endpoint: String(input.endpoint ?? '').trim(),
  };

  if (provider === 'api') {
    const previousSetup = getLlmSetup(userId);
    const nextApiKey = String(input.apiKey ?? '').trim();
    const previousApiKey = String(previousSetup?.apiKey ?? '').trim();

    if (nextApiKey && !isMaskedApiKey(nextApiKey)) {
      setup.apiKey = nextApiKey;
    } else if (previousApiKey) {
      setup.apiKey = previousApiKey;
    }
  }

  return setup;
}

function normalizeNumber(value, fallback, { min, max }) {
  const nextValue = Number(value);

  if (!Number.isInteger(nextValue)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, nextValue));
}

function normalizeFloat(value, fallback, { min, max }) {
  const nextValue = Number(value);

  if (!Number.isFinite(nextValue)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, nextValue));
}

function normalizeRerankerSetup(value) {
  const input = value && typeof value === 'object' ? value : {};
  const topK = normalizeNumber(input.topK, DEFAULT_RERANKER_CONFIG.topK, { min: 1, max: 20 });
  const candidateLimit = normalizeNumber(
    input.candidateLimit,
    DEFAULT_RERANKER_CONFIG.candidateLimit,
    { min: topK, max: 100 },
  );
  const model = String(input.model ?? DEFAULT_RERANKER_CONFIG.model).trim()
    || DEFAULT_RERANKER_CONFIG.model;

  return {
    enabled: input.enabled === true,
    model,
    candidateLimit,
    topK,
  };
}

function normalizeVectorDbSetup(value, userId) {
  const input = value && typeof value === 'object' ? value : {};
  const provider = input.provider === 'supabase' ? 'supabase' : 'sqlite';
  const setup = {
    provider,
    name: provider === 'supabase' ? 'Supabase' : 'SQLite',
  };

  if (provider === 'supabase') {
    const previousSetup = getVectorDbSetup(userId);
    const nextServiceRoleKey = String(input.serviceRoleKey ?? '').trim();
    const previousServiceRoleKey = String(previousSetup?.serviceRoleKey ?? '').trim();

    setup.projectUrl = String(input.projectUrl ?? '').trim().replace(/\/+$/, '');
    setup.table = String(input.table ?? 'embeddly_chunks').trim() || 'embeddly_chunks';
    setup.dimensions = normalizeNumber(input.dimensions, 768, { min: 1, max: 4096 });
    setup.matchThreshold = normalizeFloat(input.matchThreshold, 0, { min: 0, max: 1 });

    if (nextServiceRoleKey && !isMaskedApiKey(nextServiceRoleKey)) {
      setup.serviceRoleKey = nextServiceRoleKey;
    } else if (previousServiceRoleKey) {
      setup.serviceRoleKey = previousServiceRoleKey;
    }
  }

  return setup;
}

function normalizeSetting(publicKey, value, userId) {
  if (publicKey === 'llm') {
    return normalizeLlmSetup(value, userId);
  }

  if (publicKey === 'reranker') {
    return normalizeRerankerSetup(value);
  }

  if (publicKey === 'vectorDb') {
    return normalizeVectorDbSetup(value, userId);
  }

  return value;
}

function getGlobalSettingRow(storageKey) {
  return db.prepare('SELECT value, encrypted FROM settings WHERE key = ?').get(storageKey);
}

function getGlobalSettingsRows() {
  return db.prepare('SELECT key, value, encrypted FROM settings').all();
}

export function getSetting(storageKey, userId) {
  const row = userId
    ? getUserSettingRow(userId, storageKey) ?? getGlobalSettingRow(storageKey)
    : getGlobalSettingRow(storageKey);

  return parseSettingValue(row);
}

export function setSetting(storageKey, value, userId) {
  const encrypted = shouldEncryptSetting(value) ? 1 : 0;
  const serializedValue = JSON.stringify(value);
  const storedValue = encrypted ? encryptSetting(serializedValue) : serializedValue;

  if (userId) {
    setUserSettingRow(userId, storageKey, storedValue, encrypted);
    return;
  }

  db.prepare(`
    INSERT INTO settings (key, value, encrypted, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      encrypted = excluded.encrypted,
      updated_at = excluded.updated_at
  `).run(storageKey, storedValue, encrypted, nowIso());
}

export function deleteSetting(storageKey, userId) {
  if (userId) {
    deleteUserSettingRow(userId, storageKey);
    return;
  }

  db.prepare('DELETE FROM settings WHERE key = ?').run(storageKey);
}

export function getAllSettings(userId) {
  const rows = userId
    ? [...getGlobalSettingsRows(), ...getAllUserSettingRows(userId)]
    : getGlobalSettingsRows();
  const settings = {};

  for (const row of rows) {
    const publicKey = STORAGE_TO_PUBLIC_KEYS.get(row.key);
    if (!publicKey) {
      continue;
    }

    const value = parseSettingValue(row);
    if (value !== null) {
      settings[publicKey] = value;
    }
  }

  return settings;
}

export function getAllPublicSettings(userId) {
  const settings = getAllSettings(userId);

  return Object.fromEntries(
    Object.entries(settings).map(([publicKey, value]) => [
      publicKey,
      toPublicSetting(publicKey, value),
    ]),
  );
}

export function getPublicSetting(publicKey, userId) {
  const storageKey = PUBLIC_SETTING_KEYS.get(publicKey);
  if (!storageKey) {
    return undefined;
  }

  return toPublicSetting(publicKey, getSetting(storageKey, userId));
}

export function savePublicSettings(settings, userId) {
  const input = settings && typeof settings === 'object' ? settings : {};

  for (const [publicKey, value] of Object.entries(input)) {
    const storageKey = PUBLIC_SETTING_KEYS.get(publicKey);
    if (!storageKey) {
      continue;
    }

    if (value === null) {
      deleteSetting(storageKey, userId);
      continue;
    }

    setSetting(storageKey, normalizeSetting(publicKey, value, userId), userId);
  }

  return getAllPublicSettings(userId);
}

export function deletePublicSetting(publicKey, userId) {
  const storageKey = PUBLIC_SETTING_KEYS.get(publicKey);
  if (!storageKey) {
    return false;
  }

  deleteSetting(storageKey, userId);
  return true;
}

export function getLlmSetup(userId) {
  return getSetting(SETTINGS_KEYS.llm, userId);
}

export function getEmbeddingSetup(userId) {
  return getSetting(SETTINGS_KEYS.embedding, userId);
}

export function getChunkingConfig(userId) {
  return getSetting(SETTINGS_KEYS.chunking, userId);
}

export function getVectorDbSetup(userId) {
  return getSetting(SETTINGS_KEYS.vectorDb, userId);
}

export function getRerankerSetup(userId) {
  const setting = getSetting(SETTINGS_KEYS.reranker, userId);
  return setting ? normalizeRerankerSetup(setting) : null;
}
