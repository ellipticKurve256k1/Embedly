export const EMBEDDING_SETUP_STORAGE_KEY = 'embeddly.embeddingSetup';
export const LLM_SETUP_STORAGE_KEY = 'embeddly.llmSetup';
export const VECTOR_DB_SETUP_STORAGE_KEY = 'embeddly.vectorDbSetup';
export const CHUNKING_CONFIG_STORAGE_KEY = 'embeddly.chunkingConfig';

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

function coerceNumber(value, fallback) {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) ? nextValue : fallback;
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

export function readSavedSetup(storageKey) {
  try {
    const savedSetup = window.localStorage.getItem(storageKey);
    return savedSetup ? JSON.parse(savedSetup) : null;
  } catch {
    return null;
  }
}

export function readSavedEmbeddingSetup() {
  return readSavedSetup(EMBEDDING_SETUP_STORAGE_KEY);
}

export function readSavedLlmSetup() {
  return readSavedSetup(LLM_SETUP_STORAGE_KEY);
}

export function readSavedVectorDbSetup() {
  return readSavedSetup(VECTOR_DB_SETUP_STORAGE_KEY) ?? DEFAULT_VECTOR_DB_SETUP;
}

export function readSavedChunkingConfig() {
  return normalizeChunkingConfig(readSavedSetup(CHUNKING_CONFIG_STORAGE_KEY) ?? DEFAULT_CHUNKING_CONFIG);
}
