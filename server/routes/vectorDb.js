import express from 'express';
import { getVectorDbSetup, isMaskedApiKey } from '../services/settings.js';
import { createSqliteVectorStore } from '../services/vectorStores/sqliteVectorStore.js';
import { createSupabaseVectorStore } from '../services/vectorStores/supabaseVectorStore.js';

const router = express.Router();

router.post('/test-connection', async (request, response) => {
  const setup = request.body && typeof request.body === 'object' ? request.body : {};
  const provider = setup.provider === 'supabase' ? 'supabase' : 'sqlite';

  try {
    const previousSetup = getVectorDbSetup(request.userId);
    const requestedServiceRoleKey = String(setup.serviceRoleKey ?? '').trim();
    const resolvedSetup = provider === 'supabase'
      ? {
        ...setup,
        serviceRoleKey: requestedServiceRoleKey && !isMaskedApiKey(requestedServiceRoleKey)
          ? requestedServiceRoleKey
          : previousSetup?.serviceRoleKey,
      }
      : setup;
    const vectorStore = provider === 'supabase'
      ? createSupabaseVectorStore(resolvedSetup)
      : createSqliteVectorStore();

    await vectorStore.testConnection();
    response.json({
      ok: true,
      message: provider === 'supabase'
        ? 'Connected to Supabase successfully.'
        : 'SQLite is available.',
    });
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : 'Connection test failed.',
    });
  }
});

export default router;
