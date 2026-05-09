export const EMBEDDING_SETUP_STORAGE_KEY = 'embeddly.embeddingSetup';
export const LLM_SETUP_STORAGE_KEY = 'embeddly.llmSetup';
export const VECTOR_DB_SETUP_STORAGE_KEY = 'embeddly.vectorDbSetup';

const DEFAULT_VECTOR_DB_SETUP = {
  provider: 'sqlite',
  name: 'SQLite',
};

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
