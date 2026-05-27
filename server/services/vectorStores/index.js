import { getVectorDbSetup } from '../settings.js';
import { createSqliteVectorStore } from './sqliteVectorStore.js';
import { createSupabaseVectorStore } from './supabaseVectorStore.js';

const DEFAULT_VECTOR_DB_SETUP = {
  provider: 'sqlite',
  name: 'SQLite',
};

export function createVectorStore(setup = DEFAULT_VECTOR_DB_SETUP) {
  if (setup?.provider === 'supabase') {
    return createSupabaseVectorStore(setup);
  }

  return createSqliteVectorStore();
}

export function getVectorStore() {
  return createVectorStore(getVectorDbSetup() ?? DEFAULT_VECTOR_DB_SETUP);
}
