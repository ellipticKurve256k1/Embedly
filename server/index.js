import cors from 'cors';
import express from 'express';
import './db.js';
import documentsRouter from './routes/documents.js';
import embedRouter from './routes/embed.js';
import jobsRouter from './routes/jobs.js';
import searchRouter from './routes/search.js';
import uploadRouter from './routes/upload.js';

const PORT = Number(process.env.PORT ?? 3001);
const app = express();

app.use(cors({ origin: true }));
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_request, response) => {
  response.json({ ok: true });
});

app.use('/api/upload', uploadRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/embed', embedRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/search', searchRouter);

app.use((error, _request, response, _next) => {
  const status = error.statusCode || error.status || 500;
  response.status(status).json({
    error: error.message || 'Unexpected server error.',
  });
});

app.listen(PORT, () => {
  console.log(`Express server running on http://localhost:${PORT}`);
});
