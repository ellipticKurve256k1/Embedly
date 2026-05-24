import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';
import {
  CHUNKING_CONFIG_STORAGE_KEY,
  DEFAULT_CHUNKING_CONFIG,
  DEFAULT_RERANKER_SETUP,
  EMBEDDING_SETUP_STORAGE_KEY,
  initializeSettings,
  loadSettings,
  normalizeChunkingConfig,
  normalizeRerankerSetup,
  normalizeVectorDbSetup,
  readSavedChunkingConfig,
  readSavedEmbeddingSetup,
  readSavedRerankerSetup,
  readSavedVectorDbSetup,
  saveChunkingConfig,
  saveEmbeddingSetup,
  saveRetrievalSettings,
  saveSettings,
  testVectorDbConnection,
} from './storage.js';

const originalFetch = global.fetch;
const originalWindow = global.window;
const originalCustomEvent = global.CustomEvent;

function createLocalStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    has: (key) => values.has(key),
  };
}

beforeEach(() => {
  global.CustomEvent = class CustomEvent {
    constructor(type) {
      this.type = type;
    }
  };
  global.window = {
    localStorage: createLocalStorage(),
    dispatchEvent: () => true,
  };
});

afterEach(async () => {
  global.fetch = originalFetch;
  global.window = originalWindow;
  global.CustomEvent = originalCustomEvent;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({}),
  });
  await loadSettings();
  global.fetch = originalFetch;
});

function jsonResponse(payload, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: async () => payload,
  };
}

test('normalizeChunkingConfig returns defaults for empty input', () => {
  assert.deepEqual(normalizeChunkingConfig({}), DEFAULT_CHUNKING_CONFIG);
});

test('normalizeChunkingConfig clamps invalid strategy and numbers', () => {
  const result = normalizeChunkingConfig({ strategy: 'bad', maxTokens: -1, minTokens: 9999 });
  assert.equal(result.strategy, 'recursive');
  assert.equal(result.maxTokens, 100);
  assert.equal(result.minTokens, 100);
});

test('normalizeRerankerSetup returns safe defaults and bounded limits', () => {
  assert.deepEqual(normalizeRerankerSetup({}), DEFAULT_RERANKER_SETUP);

  const result = normalizeRerankerSetup({
    enabled: true,
    model: ' ',
    candidateLimit: 2,
    topK: 40,
  });

  assert.deepEqual(result, {
    enabled: true,
    model: DEFAULT_RERANKER_SETUP.model,
    candidateLimit: 20,
    topK: 20,
  });
});

test('readSavedVectorDbSetup returns default when unset', () => {
  assert.deepEqual(readSavedVectorDbSetup(), { provider: 'sqlite', name: 'SQLite' });
});

test('normalizeVectorDbSetup returns SQLite default for unknown provider', () => {
  assert.deepEqual(normalizeVectorDbSetup({ provider: 'other' }), {
    provider: 'sqlite',
    name: 'SQLite',
  });
});

test('normalizeVectorDbSetup normalizes Supabase fields', () => {
  assert.deepEqual(normalizeVectorDbSetup({
    provider: 'supabase',
    projectUrl: 'https://test.supabase.co/',
    serviceRoleKey: 'secret',
    table: '',
    dimensions: 99999,
    matchThreshold: -1,
    hasServiceRoleKey: true,
  }), {
    provider: 'supabase',
    name: 'Supabase',
    projectUrl: 'https://test.supabase.co',
    serviceRoleKey: 'secret',
    table: 'embeddly_chunks',
    dimensions: 4096,
    matchThreshold: 0,
    hasServiceRoleKey: true,
  });
});

test('loadSettings updates cached settings', async () => {
  global.fetch = async () => jsonResponse({ embedding: { model: 'nomic' } });
  await loadSettings();
  assert.deepEqual(readSavedEmbeddingSetup(), { model: 'nomic' });
});

test('saveSettings posts settings and updates cache', async () => {
  global.fetch = async (_url, options) => {
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), { embedding: { model: 'nomic' } });
    return jsonResponse({ embedding: { model: 'nomic' } });
  };

  await saveSettings({ embedding: { model: 'nomic' } });
  assert.deepEqual(readSavedEmbeddingSetup(), { model: 'nomic' });
});

test('testVectorDbConnection posts normalized setup', async () => {
  global.fetch = async (url, options) => {
    assert.match(url, /\/api\/vector-db\/test-connection$/);
    assert.equal(options.method, 'POST');
    const body = JSON.parse(options.body);
    assert.equal(body.provider, 'supabase');
    assert.equal(body.table, 'embeddly_chunks');
    return jsonResponse({ ok: true });
  };

  assert.deepEqual(await testVectorDbConnection({ provider: 'supabase' }), { ok: true });
});

test('saveEmbeddingSetup returns saved embedding setting', async () => {
  global.fetch = async () => jsonResponse({ embedding: { provider: 'ollama', model: 'mxbai' } });
  assert.deepEqual(await saveEmbeddingSetup({ provider: 'ollama', model: 'mxbai' }), {
    provider: 'ollama',
    model: 'mxbai',
  });
});

test('saveChunkingConfig normalizes before save', async () => {
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.chunking.strategy, 'fixed');
    assert.equal(body.chunking.maxTokens, 100);
    return jsonResponse({ chunking: body.chunking });
  };

  const result = await saveChunkingConfig({ strategy: 'fixed', maxTokens: 20 });
  assert.equal(result.strategy, 'fixed');
  assert.equal(result.maxTokens, 100);
});

test('saveRetrievalSettings saves chunking and reranker together', async () => {
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.chunking.strategy, 'recursive');
    assert.equal(body.reranker.enabled, true);
    return jsonResponse(body);
  };

  const result = await saveRetrievalSettings({
    chunking: { strategy: 'bad' },
    reranker: { enabled: true, candidateLimit: 12, topK: 7 },
  });

  assert.equal(result.chunking.strategy, 'recursive');
  assert.deepEqual(result.reranker, {
    enabled: true,
    model: DEFAULT_RERANKER_SETUP.model,
    candidateLimit: 12,
    topK: 7,
  });
});

test('readSavedRerankerSetup returns normalized default', () => {
  assert.deepEqual(readSavedRerankerSetup(), DEFAULT_RERANKER_SETUP);
});

test('readSavedChunkingConfig returns normalized default', () => {
  assert.equal(readSavedChunkingConfig().strategy, 'recursive');
});

test('initializeSettings migrates missing localStorage settings to server', async () => {
  window.localStorage.setItem(EMBEDDING_SETUP_STORAGE_KEY, JSON.stringify({ model: 'local' }));
  window.localStorage.setItem(CHUNKING_CONFIG_STORAGE_KEY, JSON.stringify({ strategy: 'fixed' }));

  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (options.method === 'POST') {
      return jsonResponse(JSON.parse(options.body));
    }
    return jsonResponse({});
  };

  await initializeSettings();
  const postCall = calls.find((call) => call.options.method === 'POST');
  assert.ok(postCall);
  assert.equal(JSON.parse(postCall.options.body).embedding.model, 'local');
  assert.equal(window.localStorage.has(EMBEDDING_SETUP_STORAGE_KEY), false);
});

test('initializeSettings clears stale localStorage when server already has settings', async () => {
  window.localStorage.setItem(EMBEDDING_SETUP_STORAGE_KEY, JSON.stringify({ model: 'local' }));
  global.fetch = async () => jsonResponse({ embedding: { model: 'server' } });

  await initializeSettings();
  assert.equal(window.localStorage.has(EMBEDDING_SETUP_STORAGE_KEY), false);
  assert.deepEqual(readSavedEmbeddingSetup(), { model: 'server' });
});
