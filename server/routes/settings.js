import express from 'express';
import {
  deletePublicSetting,
  getAllPublicSettings,
  getPublicSetting,
  savePublicSettings,
} from '../services/settings.js';

const router = express.Router();

router.get('/', (request, response) => {
  response.json(getAllPublicSettings(request.userId));
});

router.get('/:key', (request, response) => {
  const setting = getPublicSetting(request.params.key, request.userId);

  if (setting === undefined) {
    response.status(404).json({ error: 'Unknown setting key.' });
    return;
  }

  response.json({ [request.params.key]: setting });
});

router.post('/', (request, response) => {
  response.json(savePublicSettings(request.body, request.userId));
});

router.delete('/:key', (request, response) => {
  if (!deletePublicSetting(request.params.key, request.userId)) {
    response.status(404).json({ error: 'Unknown setting key.' });
    return;
  }

  response.status(204).end();
});

export default router;
