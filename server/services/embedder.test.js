import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import {
  blobToVector,
  cosineSimilarity,
  DEFAULT_EMBEDDING_MODEL,
  embedText,
  vectorToBlob,
} from './embedder.js';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

test('cosineSimilarity returns 1 for identical vectors', () => {
  assert.equal(cosineSimilarity([1, 2, 3], [1, 2, 3]), 1);
});

test('cosineSimilarity returns 0 for orthogonal vectors', () => {
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
});

test('cosineSimilarity returns negative score for opposite vectors', () => {
  assert.equal(cosineSimilarity([1, 0], [-1, 0]), -1);
});

test('cosineSimilarity returns 0 for mismatched vector lengths', () => {
  assert.equal(cosineSimilarity([1, 2], [1]), 0);
});

test('cosineSimilarity returns 0 for null vectors', () => {
  assert.equal(cosineSimilarity(null, [1]), 0);
  assert.equal(cosineSimilarity([1], null), 0);
});

test('cosineSimilarity returns 0 when either vector has zero magnitude', () => {
  assert.equal(cosineSimilarity([0, 0], [1, 2]), 0);
  assert.equal(cosineSimilarity([1, 2], [0, 0]), 0);
});

test('vectorToBlob returns a Buffer', () => {
  assert.ok(Buffer.isBuffer(vectorToBlob([1, 2, 3])));
});

test('vectorToBlob and blobToVector round-trip arrays', () => {
  const original = [1.5, 2.5, 3.5];
  const recovered = Array.from(blobToVector(vectorToBlob(original)));
  assert.deepEqual(recovered, original);
});

test('vectorToBlob and blobToVector handle empty vectors', () => {
  const recovered = blobToVector(vectorToBlob([]));
  assert.equal(recovered.length, 0);
});

test('embedText reads Ollama embeddings response shape', async () => {
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ embeddings: [[0.1, 0.2, 0.3]] }),
  });

  assert.deepEqual(await embedText('hello', 'test-model'), [0.1, 0.2, 0.3]);
});

test('embedText reads legacy Ollama embedding response shape', async () => {
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ embedding: [0.4, 0.5] }),
  });

  assert.deepEqual(await embedText('hello'), [0.4, 0.5]);
});

test('embedText throws when provider response is not ok', async () => {
  global.fetch = async () => ({
    ok: false,
    status: 500,
    text: async () => 'down',
  });

  await assert.rejects(() => embedText('hello'), /Ollama embed failed \(500\): down/);
});

test('embedText throws when vector is empty', async () => {
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ embeddings: [[]] }),
  });

  await assert.rejects(() => embedText('hello'), /empty embedding vector/);
});

test('DEFAULT_EMBEDDING_MODEL is configured', () => {
  assert.equal(DEFAULT_EMBEDDING_MODEL, 'nomic-embed-text');
});
