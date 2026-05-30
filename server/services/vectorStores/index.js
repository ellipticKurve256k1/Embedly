import { getVectorDbSetup } from '../settings.js';
import { createSqliteVectorStore } from './sqliteVectorStore.js';
import { createSupabaseVectorStore } from './supabaseVectorStore.js';

export const DEFAULT_VECTOR_DB_SETUP = {
  provider: 'sqlite',
  name: 'SQLite',
};

export async function resolveVectorDbSetup(userId = '', authToken = null, setup = null) {
  const savedSetup = setup ?? await getVectorDbSetup(userId, authToken);
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseKey) {
    return {
      provider: 'supabase',
      name: 'Supabase',
      table: savedSetup?.table || 'embeddly_chunks',
      dimensions: savedSetup?.dimensions || 768,
      matchThreshold: savedSetup?.matchThreshold || 0,
    };
  }

  return savedSetup ?? DEFAULT_VECTOR_DB_SETUP;
}

export function createVectorStore(userId = '', setup = DEFAULT_VECTOR_DB_SETUP, options = {}) {
  const resolvedSetup = setup ?? DEFAULT_VECTOR_DB_SETUP;
  if (resolvedSetup?.provider === 'supabase') {
    return createSupabaseVectorStore(resolvedSetup, userId, options);
  }

  return createSqliteVectorStore(userId);
}

export async function getVectorStore(userId = '', options = {}) {
  return createVectorStore(
    userId,
    await resolveVectorDbSetup(userId, options.accessToken),
    options,
  );
}
