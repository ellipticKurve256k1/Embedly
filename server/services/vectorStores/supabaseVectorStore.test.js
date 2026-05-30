import assert from 'node:assert/strict';
import test from 'node:test';
import { createSupabaseVectorStore } from './supabaseVectorStore.js';

function createMockClient({ data = [], error = null, calls = [] } = {}) {
  return {
    from(table) {
      calls.push(['from', table]);
      return {
        select(columns) {
          calls.push(['select', columns]);
          return {
            limit(limit) {
              calls.push(['limit', limit]);
              return { data, error };
            },
          };
        },
        delete() {
          calls.push(['delete']);
          const chain = {
            eq(column, value) {
              calls.push(['eq', column, value]);
              return chain;
            },
            then(resolve) {
              return Promise.resolve({ data, error }).then(resolve);
            },
          };
          return chain;
        },
        insert(row) {
          calls.push(['insert', row]);
          return { data, error };
        },
      };
    },
    rpc(name, args) {
      calls.push(['rpc', name, args]);
      return { data, error };
    },
  };
}

test('indexChunk validates vector dimensions before client calls', async () => {
  const calls = [];
  const store = createSupabaseVectorStore({
    dimensions: 768,
  }, 'user-1', {
    clientFactory: () => createMockClient({ calls }),
  });

  await assert.rejects(
    () => store.indexChunk({ vector: new Float32Array(512), model: 'test' }),
    /dimension mismatch/i,
  );
  assert.deepEqual(calls, []);
});

test('testConnection validates table access', async () => {
  const calls = [];
  const store = createSupabaseVectorStore({
    table: 'embeddly_chunks',
  }, 'user-1', {
    clientFactory: () => createMockClient({ calls }),
  });

  assert.equal(await store.testConnection(), true);
  assert.deepEqual(calls, [
    ['from', 'embeddly_chunks'],
    ['select', 'id'],
    ['limit', 1],
  ]);
});

test('clearDocumentIndex scopes deletes by user id', async () => {
  const calls = [];
  const store = createSupabaseVectorStore({ table: 'embeddly_chunks' }, 'user-1', {
    clientFactory: () => createMockClient({ calls }),
  });

  await store.clearDocumentIndex('doc-1');

  assert.deepEqual(calls, [
    ['from', 'embeddly_chunks'],
    ['delete'],
    ['eq', 'document_id', 'doc-1'],
    ['eq', 'user_id', 'user-1'],
  ]);
});

test('indexChunk includes user id in inserted row', async () => {
  const calls = [];
  const store = createSupabaseVectorStore({ dimensions: 3 }, 'user-1', {
    clientFactory: () => createMockClient({ calls }),
  });

  await store.indexChunk({
    document: {
      id: 'doc-1',
      filename: 'doc.txt',
      mime_type: 'text/plain',
      size_bytes: 12,
      project_id: null,
      project_name: null,
      created_at: '2026-05-21T00:00:00.000Z',
      chunk_count: 1,
    },
    chunk: {
      id: 'chunk-1',
      idx: 0,
      content: 'hello',
      tokenCount: 2,
    },
    vector: new Float32Array([0.1, 0.2, 0.3]),
    model: 'nomic',
  });

  const insertCall = calls.find((call) => call[0] === 'insert');
  assert.equal(insertCall[1].user_id, 'user-1');
});

test('retrieveChunks normalizes RPC results to public chunk shape', async () => {
  const calls = [];
  const store = createSupabaseVectorStore({
    dimensions: 3,
  }, 'user-1', {
    clientFactory: () => createMockClient({
      calls,
      data: [{
        chunk_id: 'chunk-1',
        chunk_index: 0,
        content: 'hello',
        token_count: 2,
        document_id: 'doc-1',
        document_name: 'doc.txt',
        document_type: 'text/plain',
        document_size: 12,
        project_id: null,
        project_name: null,
        uploaded_at: '2026-05-21T00:00:00.000Z',
        total_chunks: 1,
        embedding_model: 'nomic',
        score: 0.91,
      }],
    }),
  });

  const results = await store.retrieveChunks({
    queryVector: new Float32Array([0.1, 0.2, 0.3]),
    model: 'nomic',
    limit: 5,
  });

  assert.equal(results[0].chunkId, 'chunk-1');
  assert.equal(results[0].documentName, 'doc.txt');
  assert.equal(results[0].score, 0.91);
  assert.equal(results[0].previousChunk, null);
  const rpcCall = calls.find((call) => call[0] === 'rpc');
  assert.equal(rpcCall[2].match_user_id, 'user-1');
});
