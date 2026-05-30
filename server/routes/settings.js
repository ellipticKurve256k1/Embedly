import express from 'express';
import {
  deletePublicSetting,
  getAllPublicSettings,
  getPublicSetting,
  savePublicSettings,
} from '../services/settings.js';

const router = express.Router();

function getRequestUserId(request) {
  return String(request.userId ?? '').trim();
}

function getRequestAuthToken(request) {
  return request.authToken ?? null;
}

router.get('/', async (request, response) => {
  response.json(await getAllPublicSettings(getRequestUserId(request), getRequestAuthToken(request)));
});

router.get('/:key', async (request, response) => {
  const setting = await getPublicSetting(
    getRequestUserId(request),
    request.params.key,
    getRequestAuthToken(request),
  );

  if (setting === undefined) {
    response.status(404).json({ error: 'Unknown setting key.' });
    return;
  }

  response.json({ [request.params.key]: setting });
});

router.post('/', async (request, response) => {
  response.json(await savePublicSettings(
    getRequestUserId(request),
    request.body,
    getRequestAuthToken(request),
  ));
});

router.delete('/:key', async (request, response) => {
  if (!await deletePublicSetting(
    getRequestUserId(request),
    request.params.key,
    getRequestAuthToken(request),
  )) {
    response.status(404).json({ error: 'Unknown setting key.' });
    return;
  }

  response.status(204).end();
});

export default router;
