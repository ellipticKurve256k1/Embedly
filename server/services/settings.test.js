import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { db } from '../db.js';
import { credentialDb } from '../db/credentials.js';
import {
  deletePublicSetting,
  deleteSetting,
  getAllPublicSettings,
  getPublicSetting,
  getRerankerSetup,
  getSetting,
  getVectorDbSetup,
  isMaskedApiKey,
  maskApiKey,
  savePublicSettings,
  setSetting,
  SETTINGS_KEYS,
} from './settings.js';

afterEach(() => {
  for (const key of Object.values(SETTINGS_KEYS)) {
    deleteSetting(key);
  }
  deleteSetting('test.raw');
  credentialDb.prepare("DELETE FROM user_settings WHERE user_id LIKE 'test-user%'").run();
  credentialDb.prepare("DELETE FROM users WHERE id LIKE 'test-user%'").run();
});

test('getSetting returns null for missing key', () => {
  assert.equal(getSetting('test.raw'), null);
});

test('setSetting creates and reads plain values', () => {
  setSetting('test.raw', { value: 1 });
  assert.deepEqual(getSetting('test.raw'), { value: 1 });
});

test('setSetting updates existing values', () => {
  setSetting('test.raw', { value: 1 });
  setSetting('test.raw', { value: 2 });
  assert.deepEqual(getSetting('test.raw'), { value: 2 });
});

test('setSetting encrypts values that contain apiKey', () => {
  setSetting(SETTINGS_KEYS.llm, { provider: 'api', apiKey: 'sk-secret' });
  const row = db.prepare('SELECT value, encrypted FROM settings WHERE key = ?').get(SETTINGS_KEYS.llm);
  assert.equal(row.encrypted, 1);
  assert.doesNotMatch(row.value, /sk-secret/);
  assert.equal(getSetting(SETTINGS_KEYS.llm).apiKey, 'sk-secret');
});

test('setSetting encrypts values that contain serviceRoleKey', () => {
  setSetting(SETTINGS_KEYS.vectorDb, {
    provider: 'supabase',
    projectUrl: 'https://test.supabase.co',
    serviceRoleKey: 'supabase-secret',
  });
  const row = db.prepare('SELECT value, encrypted FROM settings WHERE key = ?')
    .get(SETTINGS_KEYS.vectorDb);
  assert.equal(row.encrypted, 1);
  assert.doesNotMatch(row.value, /supabase-secret/);
  assert.equal(getSetting(SETTINGS_KEYS.vectorDb).serviceRoleKey, 'supabase-secret');
});

test('maskApiKey masks middle portion of long keys', () => {
  const masked = maskApiKey('sk-1234567890abcdef');
  assert.equal(masked, 'sk-1234...def');
});

test('maskApiKey handles short keys', () => {
  assert.equal(maskApiKey('secret'), 'se...et');
});

test('isMaskedApiKey recognizes masked keys', () => {
  assert.equal(isMaskedApiKey('sk-1234...def'), true);
  assert.equal(isMaskedApiKey('sk-secret'), false);
});

test('savePublicSettings ignores unknown keys', () => {
  const result = savePublicSettings({ unknown: { value: true } });
  assert.deepEqual(result, {});
});

test('savePublicSettings persists public embedding setting', () => {
  const result = savePublicSettings({ embedding: { provider: 'ollama', model: 'nomic' } });
  assert.equal(result.embedding.model, 'nomic');
  assert.equal(getPublicSetting('embedding').model, 'nomic');
});

test('savePublicSettings persists normalized reranker settings', () => {
  const result = savePublicSettings({
    reranker: {
      enabled: true,
      model: ' ',
      candidateLimit: 2,
      topK: 30,
    },
  });

  assert.deepEqual(result.reranker, {
    enabled: true,
    model: 'Xenova/bge-reranker-v2-m3',
    candidateLimit: 20,
    topK: 20,
  });
  assert.deepEqual(getRerankerSetup(), result.reranker);
});

test('savePublicSettings normalizes SQLite vector DB settings', () => {
  const result = savePublicSettings({ vectorDb: { provider: 'unknown', name: 'Other' } });
  assert.deepEqual(result.vectorDb, { provider: 'sqlite', name: 'SQLite' });
  assert.deepEqual(getVectorDbSetup(), { provider: 'sqlite', name: 'SQLite' });
});

test('savePublicSettings normalizes and masks Supabase vector DB settings', () => {
  const result = savePublicSettings({
    vectorDb: {
      provider: 'supabase',
      projectUrl: 'https://test.supabase.co/',
      serviceRoleKey: 'service-role-secret',
      table: '',
      dimensions: 99999,
      matchThreshold: 2,
    },
  });

  assert.equal(result.vectorDb.provider, 'supabase');
  assert.equal(result.vectorDb.projectUrl, 'https://test.supabase.co');
  assert.equal(result.vectorDb.table, 'embeddly_chunks');
  assert.equal(result.vectorDb.dimensions, 4096);
  assert.equal(result.vectorDb.matchThreshold, 1);
  assert.equal(result.vectorDb.hasServiceRoleKey, true);
  assert.equal(result.vectorDb.serviceRoleKey, 'service...ret');
  assert.equal(getVectorDbSetup().serviceRoleKey, 'service-role-secret');
});

test('savePublicSettings preserves previous Supabase service role key when masked key is submitted', () => {
  savePublicSettings({
    vectorDb: {
      provider: 'supabase',
      projectUrl: 'https://test.supabase.co',
      serviceRoleKey: 'service-role-secret',
      dimensions: 768,
    },
  });
  savePublicSettings({
    vectorDb: {
      provider: 'supabase',
      projectUrl: 'https://next.supabase.co',
      serviceRoleKey: 'service...ret',
      dimensions: 768,
    },
  });

  assert.equal(getVectorDbSetup().projectUrl, 'https://next.supabase.co');
  assert.equal(getVectorDbSetup().serviceRoleKey, 'service-role-secret');
});

test('savePublicSettings masks public API keys', () => {
  const result = savePublicSettings({
    llm: { provider: 'api', model: 'gpt', endpoint: 'https://example.test/v1', apiKey: 'sk-1234567890' },
  });
  assert.equal(result.llm.hasApiKey, true);
  assert.equal(result.llm.apiKey, 'sk-1234...890');
});

test('savePublicSettings preserves previous API key when masked key is submitted', () => {
  savePublicSettings({
    llm: { provider: 'api', model: 'gpt', endpoint: 'https://example.test/v1', apiKey: 'sk-1234567890' },
  });
  savePublicSettings({
    llm: { provider: 'api', model: 'gpt-2', endpoint: 'https://example.test/v1', apiKey: 'sk-1234...890' },
  });
  assert.equal(getSetting(SETTINGS_KEYS.llm).apiKey, 'sk-1234567890');
  assert.equal(getSetting(SETTINGS_KEYS.llm).model, 'gpt-2');
});

test('deletePublicSetting deletes known public settings', () => {
  savePublicSettings({ vectorDb: { provider: 'sqlite' } });
  assert.equal(deletePublicSetting('vectorDb'), true);
  assert.equal(getPublicSetting('vectorDb'), null);
});

test('deletePublicSetting rejects unknown public settings', () => {
  assert.equal(deletePublicSetting('unknown'), false);
});

test('getAllPublicSettings returns only supported public keys', () => {
  setSetting('test.raw', { hidden: true });
  savePublicSettings({ chunking: { strategy: 'fixed' } });
  assert.deepEqual(Object.keys(getAllPublicSettings()), ['chunking']);
});

test('user settings override global settings without replacing global values', () => {
  savePublicSettings({ embedding: { provider: 'ollama', model: 'global-model' } });
  savePublicSettings(
    { embedding: { provider: 'ollama', model: 'user-model' } },
    'test-user-settings',
  );

  assert.equal(getPublicSetting('embedding').model, 'global-model');
  assert.equal(getPublicSetting('embedding', 'test-user-settings').model, 'user-model');
});

test('missing user settings fall back to global settings', () => {
  savePublicSettings({ vectorDb: { provider: 'sqlite', name: 'SQLite' } });

  assert.deepEqual(getPublicSetting('vectorDb', 'test-user-fallback'), {
    provider: 'sqlite',
    name: 'SQLite',
  });
});

test('user API keys are encrypted in the credential database', () => {
  savePublicSettings(
    {
      llm: {
        provider: 'api',
        model: 'gpt',
        endpoint: 'https://example.test/v1',
        apiKey: 'sk-user-secret',
      },
    },
    'test-user-secret',
  );

  const row = credentialDb.prepare(`
    SELECT value, encrypted
    FROM user_settings
    WHERE user_id = ? AND key = ?
  `).get('test-user-secret', SETTINGS_KEYS.llm);

  assert.equal(row.encrypted, 1);
  assert.doesNotMatch(row.value, /sk-user-secret/);
  assert.equal(getPublicSetting('llm', 'test-user-secret').apiKey, 'sk-user...ret');
});
