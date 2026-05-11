import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_RETRIEVAL_LIMIT,
  retrieveChunks,
  toContextChunk,
  toPublicChunk,
} from './retrieval.js';

test('toPublicChunk maps database row to API shape', () => {
  const result = toPublicChunk({
    chunk_id: 'c1',
    chunk_index: 2,
    content: 'content',
    document_id: 'd1',
    document_name: 'doc.txt',
    document_type: 'text/plain',
    document_size: 42,
    uploaded_at: '2026-05-11T00:00:00.000Z',
    total_chunks: 4,
    token_count: 12,
    embedding_model: 'nomic',
  }, 0.7);

  assert.deepEqual(result, {
    chunkId: 'c1',
    chunkIndex: 2,
    content: 'content',
    documentId: 'd1',
    documentName: 'doc.txt',
    documentType: 'text/plain',
    documentSize: 42,
    uploadedAt: '2026-05-11T00:00:00.000Z',
    totalChunks: 4,
    tokenCount: 12,
    embeddingModel: 'nomic',
    previousChunk: null,
    nextChunk: null,
    score: 0.7,
  });
});

test('toContextChunk creates preview from content', () => {
  const result = toContextChunk({
    content: 'abc',
    score: 1,
    previousChunk: { chunkId: 'prev', content: 'before' },
    nextChunk: { chunkId: 'next', content: 'after' },
  });
  assert.equal(result.preview, 'abc');
  assert.equal(result.score, 1);
  assert.deepEqual(result.previousChunk, { chunkId: 'prev', content: 'before' });
  assert.deepEqual(result.nextChunk, { chunkId: 'next', content: 'after' });
});

test('toContextChunk truncates long preview', () => {
  const result = toContextChunk({ content: 'x'.repeat(300) });
  assert.equal(result.preview.length, 263);
  assert.match(result.preview, /\.\.\.$/);
});

test('retrieveChunks rejects empty query before provider call', async () => {
  await assert.rejects(() => retrieveChunks('   '), /Search query is required/);
});

test('DEFAULT_RETRIEVAL_LIMIT is five', () => {
  assert.equal(DEFAULT_RETRIEVAL_LIMIT, 5);
});
