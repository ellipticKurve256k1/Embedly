import express from 'express';
import { DEFAULT_EMBEDDING_MODEL } from '../services/embedder.js';
import { embedQueue } from '../services/embedQueue.js';

const router = express.Router();

router.get('/events', (request, response) => {
  response.setHeader('Content-Type', 'text/event-stream');
  response.setHeader('Cache-Control', 'no-cache, no-transform');
  response.setHeader('Connection', 'keep-alive');
  response.flushHeaders?.();

  const sendEvent = (event) => {
    response.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  sendEvent({ type: 'status', data: embedQueue.getStatus() });

  const heartbeatId = setInterval(() => {
    response.write(': heartbeat\n\n');
  }, 15000);

  const unsubscribe = embedQueue.subscribe(sendEvent);

  request.on('close', () => {
    clearInterval(heartbeatId);
    unsubscribe();
  });
});

router.get('/status', (_request, response) => {
  response.json(embedQueue.getStatus());
});

router.post('/', async (request, response, next) => {
  try {
    const documentIds = Array.isArray(request.body?.documentIds) ? request.body.documentIds : [];
    const uniqueDocumentIds = [...new Set(documentIds)].filter(Boolean);

    if (uniqueDocumentIds.length === 0) {
      response.status(400).json({ error: 'documentIds must contain at least one document id.' });
      return;
    }

    const model = request.body?.model || DEFAULT_EMBEDDING_MODEL;
    const jobs = await embedQueue.enqueueDocuments(uniqueDocumentIds, {
      chunking: request.body?.chunking,
      model,
      userId: request.userId ?? '',
      accessToken: request.authToken ?? null,
    });

    response.status(202).json({
      jobs,
      message: `${jobs.length} embedding job${jobs.length === 1 ? '' : 's'} queued.`,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
