import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import {
  DEFAULT_RERANKER_MODEL,
  clearRerankerCache,
  isRerankerEnabled,
  rerankDocuments,
  setRerankerPipelineFactoryForTests,
} from './reranker.js';

afterEach(() => {
  setRerankerPipelineFactoryForTests(null);
  clearRerankerCache();
});

test('isRerankerEnabled only accepts explicit true', () => {
  assert.equal(isRerankerEnabled({ enabled: true }), true);
  assert.equal(isRerankerEnabled({ enabled: false }), false);
  assert.equal(isRerankerEnabled(null), false);
});

test('rerankDocuments leaves documents unchanged when disabled', async () => {
  const documents = [{ chunkId: 'a', content: 'alpha', score: 0.9 }];
  const result = await rerankDocuments('alpha', documents, { enabled: false });

  assert.equal(result, documents);
});

test('rerankDocuments sorts by cross-encoder score', async () => {
  const calls = [];

  setRerankerPipelineFactoryForTests(async (task, model, options) => {
    assert.equal(task, 'text-classification');
    assert.equal(model, DEFAULT_RERANKER_MODEL);
    assert.deepEqual(options, { quantized: true });

    return async (input, pipelineOptions) => {
      calls.push({ input, pipelineOptions });
      return [{
        label: 'LABEL_0',
        score: input.includes('direct answer') ? 0.94 : 0.18,
      }];
    };
  });

  const result = await rerankDocuments('authentication flow', [
    { chunkId: 'less-relevant', content: 'authentication appears in a footnote', score: 0.91 },
    { chunkId: 'direct', content: 'direct answer about the authentication flow', score: 0.72 },
  ], {
    enabled: true,
    model: DEFAULT_RERANKER_MODEL,
  });

  assert.equal(result[0].chunkId, 'direct');
  assert.equal(result[0].rerankScore, 0.94);
  assert.equal(result[1].rerankScore, 0.18);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].pipelineOptions, { truncation: true, max_length: 512 });
});

test('rerankDocuments clamps invalid scores and falls back per document', async () => {
  setRerankerPipelineFactoryForTests(async () => {
    let callCount = 0;

    return async () => {
      callCount += 1;

      if (callCount === 1) {
        return [[{ score: 2 }]];
      }

      throw new Error('classification failed');
    };
  });

  const result = await rerankDocuments('query', [
    { chunkId: 'clamped', content: 'first', score: 0.1 },
    { chunkId: 'fallback', content: 'second', score: 0.9 },
  ], { enabled: true });

  assert.equal(result[0].chunkId, 'clamped');
  assert.equal(result[0].rerankScore, 1);
  assert.equal(result[1].rerankScore, 0.5);
});

test('rerankDocuments falls back to original documents when pipeline cannot load', async () => {
  const originalWarn = console.warn;
  console.warn = () => {};
  setRerankerPipelineFactoryForTests(async () => {
    throw new Error('missing model');
  });

  try {
    const documents = [{ chunkId: 'a', content: 'alpha', score: 0.9 }];
    const result = await rerankDocuments('alpha', documents, { enabled: true });

    assert.equal(result, documents);
  } finally {
    console.warn = originalWarn;
  }
});
