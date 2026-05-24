import cors from 'cors';
import express from 'express';
import './db.js';
import { authContextMiddleware } from './middleware/auth.js';
import authRouter from './routes/auth.js';
import chatRouter from './routes/chat.js';
import documentsRouter from './routes/documents.js';
import embedRouter from './routes/embed.js';
import jobsRouter from './routes/jobs.js';
import projectsRouter from './routes/projects.js';
import searchRouter from './routes/search.js';
import settingsRouter from './routes/settings.js';
import uploadRouter from './routes/upload.js';
import vectorDbRouter from './routes/vectorDb.js';
import { initializeReranker } from './services/reranker.js';

const PORT = Number(process.env.PORT ?? 3001);
const app = express();

app.use(cors({ origin: true }));
app.use(express.json({ limit: '2mb' }));
app.use(authContextMiddleware);

app.get('/api/health', (_request, response) => {
  response.json({ ok: true });
});

app.use('/api/auth', authRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/chat', chatRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/embed', embedRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/search', searchRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/vector-db', vectorDbRouter);

app.use((error, _request, response, _next) => {
  const status = error.statusCode || error.status || 500;
  response.status(status).json({
    error: error.message || 'Unexpected server error.',
  });
});

app.listen(PORT, () => {
  console.log(`Express server running on http://localhost:${PORT}`);
});

if (process.env.PREWARM_RERANKER === 'true') {
  initializeReranker()
    .then(() => console.log('Reranker model preloaded'))
    .catch((error) => {
      console.warn('Failed to preload reranker:', error instanceof Error ? error.message : String(error));
    });
}
