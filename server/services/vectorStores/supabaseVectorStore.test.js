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
          return {
            eq(column, value) {
              calls.push(['eq', column, value]);
              return { data, error };
            },
          };
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

test('createSupabaseVectorStore rejects missing project URL', () => {
  assert.throws(() => createSupabaseVectorStore({ projectUrl: '' }), /project URL/i);
});

test('createSupabaseVectorStore rejects missing service role key', () => {
  assert.throws(() => createSupabaseVectorStore({
    projectUrl: 'https://test.supabase.co',
    serviceRoleKey: '',
  }), /service role key/i);
});

test('indexChunk validates vector dimensions before client calls', async () => {
  const calls = [];
  const store = createSupabaseVectorStore({
    projectUrl: 'https://test.supabase.co',
    serviceRoleKey: 'test-key',
    dimensions: 768,
  }, {
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
    projectUrl: 'https://test.supabase.co',
    serviceRoleKey: 'test-key',
    table: 'embeddly_chunks',
  }, {
    clientFactory: () => createMockClient({ calls }),
  });

  assert.equal(await store.testConnection(), true);
  assert.deepEqual(calls, [
    ['from', 'embeddly_chunks'],
    ['select', 'id'],
    ['limit', 1],
  ]);
});

test('retrieveChunks normalizes RPC results to public chunk shape', async () => {
  const store = createSupabaseVectorStore({
    projectUrl: 'https://test.supabase.co',
    serviceRoleKey: 'test-key',
    dimensions: 3,
  }, {
    clientFactory: () => createMockClient({
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
});
