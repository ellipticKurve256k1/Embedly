import crypto from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { db, nowIso, SERVER_DIR } from '../db.js';
import { DEFAULT_RERANKER_CONFIG } from './reranker.js';
import { getSupabaseDataClient } from './supabase.js';

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
let settingsSupabaseClientFactory = getSupabaseDataClient;

function normalizeUserId(userId) {
  return String(userId ?? '').trim();
}

function resolveUserAndKey(userIdOrKey, maybeKey) {
  if (maybeKey === undefined) {
    return { userId: '', storageKey: userIdOrKey };
  }

  return {
    userId: normalizeUserId(userIdOrKey),
    storageKey: maybeKey,
  };
}

export function setSettingsSupabaseClientFactoryForTests(factory) {
  settingsSupabaseClientFactory = factory ?? getSupabaseDataClient;
}

function getSettingsSupabaseClient(userId, authToken) {
  if (!normalizeUserId(userId) || !authToken) {
    return null;
  }

  return settingsSupabaseClientFactory(authToken);
}

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

export function resolveUserEncryptionKey(userId) {
  return crypto
    .createHmac('sha256', resolveEncryptionKey())
    .update(`embeddly:user-settings:${normalizeUserId(userId)}`)
    .digest();
}

export function encryptUserSetting(userId, plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', resolveUserEncryptionKey(userId), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

export function decryptUserSetting(userId, ciphertext) {
  const payload = Buffer.from(ciphertext, 'base64');
  const iv = payload.subarray(0, 12);
  const authTag = payload.subarray(12, 28);
  const encrypted = payload.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', resolveUserEncryptionKey(userId), iv);

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

function parseSettingValue(userId, row) {
  if (!row) {
    return null;
  }

  try {
    const json = row.encrypted ? decryptUserSetting(userId, row.value) : row.value;
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

  return value;
}

async function normalizeLlmSetup(userId, authToken, value) {
  const input = value && typeof value === 'object' ? value : {};
  const provider = input.provider === 'api' ? 'api' : 'ollama';
  const setup = {
    provider,
    model: String(input.model ?? '').trim(),
    endpoint: String(input.endpoint ?? '').trim(),
  };

  if (provider === 'api') {
    const previousSetup = await getLlmSetup(userId, authToken);
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

function normalizeVectorDbSetup(value) {
  const input = value && typeof value === 'object' ? value : {};
  const provider = input.provider === 'supabase' ? 'supabase' : 'sqlite';

  if (provider === 'sqlite') {
    return { provider: 'sqlite', name: 'SQLite' };
  }

  return {
    provider,
    name: 'Supabase',
    table: String(input.table ?? 'embeddly_chunks').trim() || 'embeddly_chunks',
    dimensions: normalizeNumber(input.dimensions, 768, { min: 1, max: 4096 }),
    matchThreshold: normalizeFloat(input.matchThreshold, 0, { min: 0, max: 1 }),
  };
}

function resolveDefaultVectorDbSetup() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseKey) {
    return {
      provider: 'supabase',
      name: 'Supabase',
      table: 'embeddly_chunks',
      dimensions: 768,
      matchThreshold: 0,
    };
  }

  return { provider: 'sqlite', name: 'SQLite' };
}

async function normalizeSetting(userId, authToken, publicKey, value) {
  if (publicKey === 'llm') {
    return normalizeLlmSetup(userId, authToken, value);
  }

  if (publicKey === 'reranker') {
    return normalizeRerankerSetup(value);
  }

  if (publicKey === 'vectorDb') {
    return normalizeVectorDbSetup(value);
  }

  return value;
}

function getUserSettingRow(userId, storageKey) {
  return db.prepare(`
    SELECT value, encrypted
    FROM user_settings
    WHERE user_id = ? AND key = ?
  `).get(normalizeUserId(userId), storageKey);
}

function getUserSettingsRows(userId) {
  return db.prepare(`
    SELECT key, value, encrypted
    FROM user_settings
    WHERE user_id = ?
  `).all(normalizeUserId(userId));
}

async function getRemoteSettingRow(userId, authToken, storageKey) {
  const client = getSettingsSupabaseClient(userId, authToken);
  if (!client) {
    return null;
  }

  const { data, error } = await client
    .from('user_settings')
    .select('value, encrypted')
    .eq('user_id', normalizeUserId(userId))
    .eq('key', storageKey)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load Supabase setting: ${error.message}`);
  }

  return data ?? null;
}

async function getRemoteSettingsRows(userId, authToken) {
  const client = getSettingsSupabaseClient(userId, authToken);
  if (!client) {
    return null;
  }

  const { data, error } = await client
    .from('user_settings')
    .select('key, value, encrypted')
    .eq('user_id', normalizeUserId(userId));

  if (error) {
    throw new Error(`Unable to load Supabase settings: ${error.message}`);
  }

  return Array.isArray(data) ? data : [];
}

async function upsertRemoteSetting(userId, authToken, storageKey, value, encrypted) {
  const client = getSettingsSupabaseClient(userId, authToken);
  if (!client) {
    return false;
  }

  const { error } = await client
    .from('user_settings')
    .upsert({
      user_id: normalizeUserId(userId),
      key: storageKey,
      value,
      encrypted: Boolean(encrypted),
      updated_at: nowIso(),
    }, { onConflict: 'user_id,key' });

  if (error) {
    throw new Error(`Unable to save Supabase setting: ${error.message}`);
  }

  return true;
}

async function deleteRemoteSetting(userId, authToken, storageKey) {
  const client = getSettingsSupabaseClient(userId, authToken);
  if (!client) {
    return false;
  }

  const { error } = await client
    .from('user_settings')
    .delete()
    .eq('user_id', normalizeUserId(userId))
    .eq('key', storageKey);

  if (error) {
    throw new Error(`Unable to delete Supabase setting: ${error.message}`);
  }

  return true;
}

async function migrateLocalSettingsToSupabase(userId, authToken, remoteRows) {
  const normalizedUserId = normalizeUserId(userId);
  const client = getSettingsSupabaseClient(normalizedUserId, authToken);
  if (!client || !normalizedUserId) {
    return;
  }

  const localRows = getUserSettingsRows(normalizedUserId);
  if (localRows.length === 0) {
    return;
  }

  const remoteKeys = new Set(remoteRows.map((row) => row.key));
  const rowsToMigrate = localRows.filter((row) => !remoteKeys.has(row.key));
  if (rowsToMigrate.length === 0) {
    return;
  }

  const { error } = await client
    .from('user_settings')
    .upsert(rowsToMigrate.map((row) => ({
      user_id: normalizedUserId,
      key: row.key,
      value: row.value,
      encrypted: Boolean(row.encrypted),
      updated_at: nowIso(),
    })), { onConflict: 'user_id,key' });

  if (error) {
    throw new Error(`Unable to migrate local settings to Supabase: ${error.message}`);
  }

  remoteRows.push(...rowsToMigrate);
}

export async function getSetting(userIdOrKey, maybeKey, authToken = null) {
  const { userId, storageKey } = resolveUserAndKey(userIdOrKey, maybeKey);
  if (userId && authToken) {
    const remoteRow = await getRemoteSettingRow(userId, authToken, storageKey);
    if (remoteRow) {
      return parseSettingValue(userId, remoteRow);
    }
  }

  return parseSettingValue(userId, getUserSettingRow(userId, storageKey));
}

export async function setSetting(userIdOrKey, keyOrValue, maybeValue, maybeAuthToken = null) {
  const hasExplicitUserId = maybeValue !== undefined;
  const userId = hasExplicitUserId ? normalizeUserId(userIdOrKey) : '';
  const storageKey = hasExplicitUserId ? keyOrValue : userIdOrKey;
  const value = hasExplicitUserId ? maybeValue : keyOrValue;
  const authToken = hasExplicitUserId ? maybeAuthToken : null;
  const encrypted = shouldEncryptSetting(value) ? 1 : 0;
  const serializedValue = JSON.stringify(value);
  const storedValue = encrypted ? encryptUserSetting(userId, serializedValue) : serializedValue;

  if (await upsertRemoteSetting(userId, authToken, storageKey, storedValue, encrypted)) {
    return;
  }

  db.prepare(`
    INSERT INTO user_settings (user_id, key, value, encrypted, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, key) DO UPDATE SET
      value = excluded.value,
      encrypted = excluded.encrypted,
      updated_at = excluded.updated_at
  `).run(userId, storageKey, storedValue, encrypted, nowIso());
}

export async function deleteSetting(userIdOrKey, maybeKey, authToken = null) {
  const { userId, storageKey } = resolveUserAndKey(userIdOrKey, maybeKey);
  if (await deleteRemoteSetting(userId, authToken, storageKey)) {
    return;
  }

  db.prepare('DELETE FROM user_settings WHERE user_id = ? AND key = ?')
    .run(userId, storageKey);
}

export async function getAllSettings(userId = '', authToken = null) {
  const normalizedUserId = normalizeUserId(userId);
  const remoteRows = await getRemoteSettingsRows(normalizedUserId, authToken);
  if (remoteRows) {
    await migrateLocalSettingsToSupabase(normalizedUserId, authToken, remoteRows);
  }

  const rows = remoteRows ?? getUserSettingsRows(normalizedUserId);
  const settings = {};

  for (const row of rows) {
    const publicKey = STORAGE_TO_PUBLIC_KEYS.get(row.key);
    if (!publicKey) {
      continue;
    }

    const value = parseSettingValue(normalizedUserId, row);
    if (value !== null) {
      settings[publicKey] = value;
    }
  }

  return settings;
}

export async function getAllPublicSettings(userId = '', authToken = null) {
  const settings = await getAllSettings(userId, authToken);
  if (!settings.vectorDb) {
    settings.vectorDb = resolveDefaultVectorDbSetup();
  }

  return Object.fromEntries(
    Object.entries(settings).map(([publicKey, value]) => [
      publicKey,
      toPublicSetting(publicKey, value),
    ]),
  );
}

export async function getPublicSetting(userIdOrPublicKey, maybePublicKey, authToken = null) {
  const publicKey = maybePublicKey === undefined ? userIdOrPublicKey : maybePublicKey;
  const userId = maybePublicKey === undefined ? '' : normalizeUserId(userIdOrPublicKey);
  const storageKey = PUBLIC_SETTING_KEYS.get(publicKey);

  if (!storageKey) {
    return undefined;
  }

  if (publicKey === 'vectorDb') {
    return toPublicSetting(publicKey, (await getSetting(userId, storageKey, authToken)) ?? resolveDefaultVectorDbSetup());
  }

  return toPublicSetting(publicKey, await getSetting(userId, storageKey, authToken));
}

export async function savePublicSettings(userIdOrSettings, maybeSettings, authToken = null) {
  const hasExplicitUserId = maybeSettings !== undefined;
  const userId = hasExplicitUserId ? normalizeUserId(userIdOrSettings) : '';
  const settings = hasExplicitUserId ? maybeSettings : userIdOrSettings;
  const input = settings && typeof settings === 'object' ? settings : {};

  for (const [publicKey, value] of Object.entries(input)) {
    const storageKey = PUBLIC_SETTING_KEYS.get(publicKey);
    if (!storageKey) {
      continue;
    }

    if (value === null) {
      await deleteSetting(userId, storageKey, authToken);
      continue;
    }

    await setSetting(userId, storageKey, await normalizeSetting(userId, authToken, publicKey, value), authToken);
  }

  return getAllPublicSettings(userId, authToken);
}

export async function deletePublicSetting(userIdOrPublicKey, maybePublicKey, authToken = null) {
  const publicKey = maybePublicKey === undefined ? userIdOrPublicKey : maybePublicKey;
  const userId = maybePublicKey === undefined ? '' : normalizeUserId(userIdOrPublicKey);
  const storageKey = PUBLIC_SETTING_KEYS.get(publicKey);

  if (!storageKey) {
    return false;
  }

  await deleteSetting(userId, storageKey, authToken);
  return true;
}

export async function getLlmSetup(userId = '', authToken = null) {
  return getSetting(userId, SETTINGS_KEYS.llm, authToken);
}

export async function getEmbeddingSetup(userId = '', authToken = null) {
  return getSetting(userId, SETTINGS_KEYS.embedding, authToken);
}

export async function getChunkingConfig(userId = '', authToken = null) {
  return getSetting(userId, SETTINGS_KEYS.chunking, authToken);
}

export async function getVectorDbSetup(userId = '', authToken = null) {
  return getSetting(userId, SETTINGS_KEYS.vectorDb, authToken);
}

export async function getRerankerSetup(userId = '', authToken = null) {
  const setting = await getSetting(userId, SETTINGS_KEYS.reranker, authToken);
  return setting ? normalizeRerankerSetup(setting) : null;
}
