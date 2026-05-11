import crypto from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { db, nowIso, SERVER_DIR } from '../db.js';

export const SETTINGS_KEYS = {
  llm: 'llm.setup',
  embedding: 'embedding.setup',
  chunking: 'chunking.config',
  vectorDb: 'vector_db.setup',
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

function resolveEncryptionKey() {
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
      && Object.prototype.hasOwnProperty.call(value, 'apiKey'),
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

function maskApiKey(apiKey) {
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

  if (publicKey !== 'llm') {
    return value;
  }

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

function normalizeLlmSetup(value) {
  const input = value && typeof value === 'object' ? value : {};
  const provider = input.provider === 'api' ? 'api' : 'ollama';
  const setup = {
    provider,
    model: String(input.model ?? '').trim(),
    endpoint: String(input.endpoint ?? '').trim(),
  };

  if (provider === 'api') {
    const previousSetup = getLlmSetup();
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

function normalizeSetting(publicKey, value) {
  if (publicKey === 'llm') {
    return normalizeLlmSetup(value);
  }

  return value;
}

export function getSetting(storageKey) {
  const row = db.prepare('SELECT value, encrypted FROM settings WHERE key = ?').get(storageKey);
  return parseSettingValue(row);
}

export function setSetting(storageKey, value) {
  const encrypted = shouldEncryptSetting(value) ? 1 : 0;
  const serializedValue = JSON.stringify(value);
  const storedValue = encrypted ? encryptSetting(serializedValue) : serializedValue;

  db.prepare(`
    INSERT INTO settings (key, value, encrypted, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      encrypted = excluded.encrypted,
      updated_at = excluded.updated_at
  `).run(storageKey, storedValue, encrypted, nowIso());
}

export function deleteSetting(storageKey) {
  db.prepare('DELETE FROM settings WHERE key = ?').run(storageKey);
}

export function getAllSettings() {
  const rows = db.prepare('SELECT key, value, encrypted FROM settings').all();
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

export function getAllPublicSettings() {
  const settings = getAllSettings();

  return Object.fromEntries(
    Object.entries(settings).map(([publicKey, value]) => [
      publicKey,
      toPublicSetting(publicKey, value),
    ]),
  );
}

export function getPublicSetting(publicKey) {
  const storageKey = PUBLIC_SETTING_KEYS.get(publicKey);
  if (!storageKey) {
    return undefined;
  }

  return toPublicSetting(publicKey, getSetting(storageKey));
}

export function savePublicSettings(settings) {
  const input = settings && typeof settings === 'object' ? settings : {};

  for (const [publicKey, value] of Object.entries(input)) {
    const storageKey = PUBLIC_SETTING_KEYS.get(publicKey);
    if (!storageKey) {
      continue;
    }

    if (value === null) {
      deleteSetting(storageKey);
      continue;
    }

    setSetting(storageKey, normalizeSetting(publicKey, value));
  }

  return getAllPublicSettings();
}

export function deletePublicSetting(publicKey) {
  const storageKey = PUBLIC_SETTING_KEYS.get(publicKey);
  if (!storageKey) {
    return false;
  }

  deleteSetting(storageKey);
  return true;
}

export function getLlmSetup() {
  return getSetting(SETTINGS_KEYS.llm);
}

export function getEmbeddingSetup() {
  return getSetting(SETTINGS_KEYS.embedding);
}

export function getChunkingConfig() {
  return getSetting(SETTINGS_KEYS.chunking);
}
