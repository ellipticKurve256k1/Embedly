export const EMBEDDING_SETUP_STORAGE_KEY = 'embeddly.embeddingSetup';
export const LLM_SETUP_STORAGE_KEY = 'embeddly.llmSetup';
export const VECTOR_DB_SETUP_STORAGE_KEY = 'embeddly.vectorDbSetup';
export const CHUNKING_CONFIG_STORAGE_KEY = 'embeddly.chunkingConfig';

const API_BASE = 'http://localhost:3001/api';
const LOCAL_STORAGE_KEYS = [
  EMBEDDING_SETUP_STORAGE_KEY,
  LLM_SETUP_STORAGE_KEY,
  VECTOR_DB_SETUP_STORAGE_KEY,
  CHUNKING_CONFIG_STORAGE_KEY,
];

const DEFAULT_VECTOR_DB_SETUP = {
  provider: 'sqlite',
  name: 'SQLite',
};

export const DEFAULT_CHUNKING_CONFIG = {
  strategy: 'recursive',
  targetTokens: 450,
  maxTokens: 800,
  minTokens: 40,
  overlapTokens: 80,
  maxChunkSize: 3200,
  minChunkSize: 160,
  overlap: 320,
};

let cachedSettings = {};

function coerceNumber(value, fallback) {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) ? nextValue : fallback;
}

async function parseResponse(response) {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || `Request failed with ${response.status}`);
  }

  return payload;
}

function safeParseJson(value) {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function readLocalStorageSetup(storageKey) {
  try {
    return safeParseJson(window.localStorage.getItem(storageKey));
  } catch {
    return null;
  }
}

function clearLocalStorageSettings() {
  try {
    for (const storageKey of LOCAL_STORAGE_KEYS) {
      window.localStorage.removeItem(storageKey);
    }
  } catch {
    // Browser storage can be unavailable in restricted modes.
  }
}

function getLocalSettingsForMigration() {
  return {
    embedding: readLocalStorageSetup(EMBEDDING_SETUP_STORAGE_KEY),
    llm: readLocalStorageSetup(LLM_SETUP_STORAGE_KEY),
    vectorDb: readLocalStorageSetup(VECTOR_DB_SETUP_STORAGE_KEY),
    chunking: readLocalStorageSetup(CHUNKING_CONFIG_STORAGE_KEY),
  };
}

function normalizeSettings(settings = {}) {
  const input = settings && typeof settings === 'object' ? settings : {};

  return {
    embedding: input.embedding ?? null,
    llm: input.llm ?? null,
    vectorDb: input.vectorDb ?? null,
    chunking: input.chunking ?? null,
  };
}

function updateCachedSettings(settings) {
  cachedSettings = normalizeSettings(settings);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('embeddly:settings-changed'));
  }

  return cachedSettings;
}

function hasAnySetting(settings) {
  return Object.values(settings).some(Boolean);
}

function getMissingServerSettings(serverSettings, localSettings) {
  return Object.fromEntries(
    Object.entries(localSettings).filter(([key, value]) => value && !serverSettings[key]),
  );
}

export function normalizeChunkingConfig(config = {}) {
  const input = config && typeof config === 'object' ? config : {};
  const strategy = ['recursive', 'paragraph', 'fixed'].includes(input.strategy)
    ? input.strategy
    : DEFAULT_CHUNKING_CONFIG.strategy;
  const maxTokens = Math.max(
    100,
    coerceNumber(input.maxTokens, Math.ceil(coerceNumber(input.maxChunkSize, 3200) / 4)),
  );
  const targetTokens = Math.min(
    maxTokens,
    Math.max(100, coerceNumber(input.targetTokens, DEFAULT_CHUNKING_CONFIG.targetTokens)),
  );
  const minTokens = Math.min(
    targetTokens,
    Math.max(1, coerceNumber(input.minTokens, Math.ceil(coerceNumber(input.minChunkSize, 160) / 4))),
  );
  const overlapTokens = Math.min(
    targetTokens - 1,
    Math.max(0, coerceNumber(input.overlapTokens, Math.ceil(coerceNumber(input.overlap, 320) / 4))),
  );

  return {
    strategy,
    targetTokens,
    maxTokens,
    minTokens,
    overlapTokens,
    maxChunkSize: Math.max(100, coerceNumber(input.maxChunkSize, maxTokens * 4)),
    minChunkSize: Math.max(1, coerceNumber(input.minChunkSize, minTokens * 4)),
    overlap: Math.max(0, coerceNumber(input.overlap, overlapTokens * 4)),
  };
}

export async function loadSettings() {
  const response = await fetch(`${API_BASE}/settings`);
  return updateCachedSettings(await parseResponse(response));
}

export async function initializeSettings() {
  const serverSettings = await loadSettings();
  const localSettings = getLocalSettingsForMigration();
  const settingsToMigrate = getMissingServerSettings(serverSettings, localSettings);

  if (hasAnySetting(settingsToMigrate)) {
    await saveSettings(settingsToMigrate);
    clearLocalStorageSettings();
    return loadSettings();
  }

  if (hasAnySetting(localSettings)) {
    clearLocalStorageSettings();
  }

  return serverSettings;
}

export async function saveSettings(settings) {
  const response = await fetch(`${API_BASE}/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });

  return updateCachedSettings(await parseResponse(response));
}

export async function saveEmbeddingSetup(setup) {
  const settings = await saveSettings({ embedding: setup });
  return settings.embedding;
}

export async function saveLlmSetup(setup) {
  const settings = await saveSettings({ llm: setup });
  return settings.llm;
}

export async function saveVectorDbSetup(setup) {
  const settings = await saveSettings({ vectorDb: setup });
  return settings.vectorDb ?? DEFAULT_VECTOR_DB_SETUP;
}

export async function saveChunkingConfig(config) {
  const normalizedConfig = normalizeChunkingConfig(config);
  const settings = await saveSettings({ chunking: normalizedConfig });
  return normalizeChunkingConfig(settings.chunking ?? normalizedConfig);
}

export function readSavedSetup(storageKey) {
  if (storageKey === EMBEDDING_SETUP_STORAGE_KEY) {
    return readSavedEmbeddingSetup();
  }

  if (storageKey === LLM_SETUP_STORAGE_KEY) {
    return readSavedLlmSetup();
  }

  if (storageKey === VECTOR_DB_SETUP_STORAGE_KEY) {
    return readSavedVectorDbSetup();
  }

  if (storageKey === CHUNKING_CONFIG_STORAGE_KEY) {
    return readSavedChunkingConfig();
  }

  return null;
}

export function readSavedEmbeddingSetup() {
  return cachedSettings.embedding ?? null;
}

export function readSavedLlmSetup() {
  return cachedSettings.llm ?? null;
}

export function readSavedVectorDbSetup() {
  return cachedSettings.vectorDb ?? DEFAULT_VECTOR_DB_SETUP;
}

export function readSavedChunkingConfig() {
  return normalizeChunkingConfig(cachedSettings.chunking ?? DEFAULT_CHUNKING_CONFIG);
}
