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
  }, 0.7);

  assert.deepEqual(result, {
    chunkId: 'c1',
    chunkIndex: 2,
    content: 'content',
    documentId: 'd1',
    documentName: 'doc.txt',
    score: 0.7,
  });
});

test('toContextChunk creates preview from content', () => {
  const result = toContextChunk({ content: 'abc', score: 1 });
  assert.equal(result.preview, 'abc');
  assert.equal(result.score, 1);
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
