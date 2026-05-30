import express from 'express';
import { createVectorStore } from '../services/vectorStores/index.js';

const router = express.Router();

router.post('/test-connection', async (request, response) => {
  const setup = request.body && typeof request.body === 'object' ? request.body : {};
  const provider = setup.provider === 'supabase' ? 'supabase' : 'sqlite';

  try {
    const vectorStore = createVectorStore(request.userId ?? '', { ...setup, provider }, {
      accessToken: request.authToken ?? null,
    });

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
