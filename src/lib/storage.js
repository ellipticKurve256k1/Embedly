export const EMBEDDING_SETUP_STORAGE_KEY = 'embeddly.embeddingSetup';
export const LLM_SETUP_STORAGE_KEY = 'embeddly.llmSetup';

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
