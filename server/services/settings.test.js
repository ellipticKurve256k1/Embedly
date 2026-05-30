import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { db } from '../db.js';
import {
  deletePublicSetting,
  deleteSetting,
  decryptUserSetting,
  encryptUserSetting,
  getAllPublicSettings,
  getPublicSetting,
  getRerankerSetup,
  getSetting,
  getVectorDbSetup,
  isMaskedApiKey,
  maskApiKey,
  savePublicSettings,
  setSettingsSupabaseClientFactoryForTests,
  setSetting,
  SETTINGS_KEYS,
} from './settings.js';

const TEST_USER_ID = 'settings-user-1';
const OTHER_USER_ID = 'settings-user-2';

afterEach(async () => {
  setSettingsSupabaseClientFactoryForTests(null);
  for (const userId of ['', TEST_USER_ID, OTHER_USER_ID]) {
    for (const key of Object.values(SETTINGS_KEYS)) {
      await deleteSetting(userId, key);
    }
    await deleteSetting(userId, 'test.raw');
  }
});

function createMockSettingsClient({ rows = [], calls = [] } = {}) {
  const findRows = (filters) => rows.filter((row) => (
    Object.entries(filters).every(([key, value]) => row[key] === value)
  ));

  const createQuery = (table) => {
    const filters = {};
    return {
      select(columns) {
        calls.push(['select', table, columns]);
        return this;
      },
      eq(column, value) {
        calls.push(['eq', column, value]);
        filters[column] = value;
        return this;
      },
      async maybeSingle() {
        calls.push(['maybeSingle']);
        return { data: findRows(filters)[0] ?? null, error: null };
      },
      then(resolve) {
        calls.push(['then']);
        return Promise.resolve({ data: findRows(filters), error: null }).then(resolve);
      },
    };
  };

  return {
    calls,
    rows,
    from(table) {
      calls.push(['from', table]);
      return {
        select(columns) {
          return createQuery(table).select(columns);
        },
        upsert(values, options) {
          calls.push(['upsert', table, values, options]);
          const nextRows = Array.isArray(values) ? values : [values];
          for (const nextRow of nextRows) {
            const existingIndex = rows.findIndex((row) => (
              row.user_id === nextRow.user_id && row.key === nextRow.key
            ));
            if (existingIndex >= 0) {
              rows[existingIndex] = { ...rows[existingIndex], ...nextRow };
            } else {
              rows.push(nextRow);
            }
          }
          return Promise.resolve({ data: null, error: null });
        },
        delete() {
          calls.push(['delete', table]);
          const filters = {};
          const chain = {
            eq(column, value) {
              calls.push(['eq', column, value]);
              filters[column] = value;
              return chain;
            },
            then(resolve) {
              for (let index = rows.length - 1; index >= 0; index -= 1) {
                if (Object.entries(filters).every(([key, value]) => rows[index][key] === value)) {
                  rows.splice(index, 1);
                }
              }
              return Promise.resolve({ data: null, error: null }).then(resolve);
            },
          };
          return chain;
        },
      };
    },
  };
}

test('getSetting returns null for missing key', async () => {
  assert.equal(await getSetting(TEST_USER_ID, 'test.raw'), null);
});

test('setSetting creates and reads plain values', async () => {
  await setSetting(TEST_USER_ID, 'test.raw', { value: 1 });
  assert.deepEqual(await getSetting(TEST_USER_ID, 'test.raw'), { value: 1 });
});

test('setSetting updates existing values', async () => {
  await setSetting(TEST_USER_ID, 'test.raw', { value: 1 });
  await setSetting(TEST_USER_ID, 'test.raw', { value: 2 });
  assert.deepEqual(await getSetting(TEST_USER_ID, 'test.raw'), { value: 2 });
});

test('settings are isolated per user', async () => {
  await setSetting(TEST_USER_ID, 'test.raw', { value: 'first' });
  await setSetting(OTHER_USER_ID, 'test.raw', { value: 'second' });

  assert.deepEqual(await getSetting(TEST_USER_ID, 'test.raw'), { value: 'first' });
  assert.deepEqual(await getSetting(OTHER_USER_ID, 'test.raw'), { value: 'second' });
});

test('setSetting encrypts values that contain apiKey', async () => {
  await setSetting(TEST_USER_ID, SETTINGS_KEYS.llm, { provider: 'api', apiKey: 'sk-secret' });
  const row = db.prepare('SELECT value, encrypted FROM user_settings WHERE user_id = ? AND key = ?')
    .get(TEST_USER_ID, SETTINGS_KEYS.llm);
  assert.equal(row.encrypted, 1);
  assert.doesNotMatch(row.value, /sk-secret/);
  assert.equal((await getSetting(TEST_USER_ID, SETTINGS_KEYS.llm)).apiKey, 'sk-secret');
});

test('user encryption keys differ by user', () => {
  const encrypted = encryptUserSetting(TEST_USER_ID, '{"apiKey":"sk-secret"}');

  assert.equal(decryptUserSetting(TEST_USER_ID, encrypted), '{"apiKey":"sk-secret"}');
  assert.throws(() => decryptUserSetting(OTHER_USER_ID, encrypted));
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

test('authenticated settings are saved to Supabase', async () => {
  const client = createMockSettingsClient();
  setSettingsSupabaseClientFactoryForTests(() => client);

  const result = await savePublicSettings(
    TEST_USER_ID,
    { embedding: { provider: 'ollama', model: 'nomic' } },
    'access-token',
  );

  assert.equal(result.embedding.model, 'nomic');
  assert.deepEqual(client.rows.map(({ user_id, key }) => ({ user_id, key })), [
    { user_id: TEST_USER_ID, key: SETTINGS_KEYS.embedding },
  ]);
  assert.equal(
    db.prepare('SELECT COUNT(*) AS count FROM user_settings WHERE user_id = ?').get(TEST_USER_ID).count,
    0,
  );
});

test('authenticated API keys are encrypted before Supabase upsert', async () => {
  const client = createMockSettingsClient();
  setSettingsSupabaseClientFactoryForTests(() => client);

  await savePublicSettings(
    TEST_USER_ID,
    { llm: { provider: 'api', model: 'gpt', endpoint: 'https://example.test/v1', apiKey: 'sk-secret' } },
    'access-token',
  );

  assert.equal(client.rows[0].encrypted, true);
  assert.doesNotMatch(client.rows[0].value, /sk-secret/);
  assert.equal((await getSetting(TEST_USER_ID, SETTINGS_KEYS.llm, 'access-token')).apiKey, 'sk-secret');
});

test('savePublicSettings ignores unknown keys', async () => {
  const result = await savePublicSettings(TEST_USER_ID, { unknown: { value: true } });
  assert.deepEqual(result, { vectorDb: { provider: 'sqlite', name: 'SQLite' } });
});

test('savePublicSettings persists public embedding setting', async () => {
  const result = await savePublicSettings(TEST_USER_ID, { embedding: { provider: 'ollama', model: 'nomic' } });
  assert.equal(result.embedding.model, 'nomic');
  assert.equal((await getPublicSetting(TEST_USER_ID, 'embedding')).model, 'nomic');
});

test('savePublicSettings persists normalized reranker settings', async () => {
  const result = await savePublicSettings(TEST_USER_ID, {
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
  assert.deepEqual(await getRerankerSetup(TEST_USER_ID), result.reranker);
});

test('savePublicSettings normalizes SQLite vector DB settings', async () => {
  const result = await savePublicSettings(TEST_USER_ID, { vectorDb: { provider: 'unknown', name: 'Other' } });
  assert.deepEqual(result.vectorDb, { provider: 'sqlite', name: 'SQLite' });
  assert.deepEqual(await getVectorDbSetup(TEST_USER_ID), { provider: 'sqlite', name: 'SQLite' });
});

test('savePublicSettings normalizes Supabase vector DB settings without credentials', async () => {
  const result = await savePublicSettings(TEST_USER_ID, {
    vectorDb: {
      provider: 'supabase',
      table: '',
      dimensions: 99999,
      matchThreshold: 2,
    },
  });

  assert.equal(result.vectorDb.provider, 'supabase');
  assert.equal(result.vectorDb.table, 'embeddly_chunks');
  assert.equal(result.vectorDb.dimensions, 4096);
  assert.equal(result.vectorDb.matchThreshold, 1);
  assert.deepEqual(await getVectorDbSetup(TEST_USER_ID), result.vectorDb);
});

test('savePublicSettings masks public API keys', async () => {
  const result = await savePublicSettings(TEST_USER_ID, {
    llm: { provider: 'api', model: 'gpt', endpoint: 'https://example.test/v1', apiKey: 'sk-1234567890' },
  });
  assert.equal(result.llm.hasApiKey, true);
  assert.equal(result.llm.apiKey, 'sk-1234...890');
});

test('savePublicSettings preserves previous API key when masked key is submitted', async () => {
  await savePublicSettings(TEST_USER_ID, {
    llm: { provider: 'api', model: 'gpt', endpoint: 'https://example.test/v1', apiKey: 'sk-1234567890' },
  });
  await savePublicSettings(TEST_USER_ID, {
    llm: { provider: 'api', model: 'gpt-2', endpoint: 'https://example.test/v1', apiKey: 'sk-1234...890' },
  });
  assert.equal((await getSetting(TEST_USER_ID, SETTINGS_KEYS.llm)).apiKey, 'sk-1234567890');
  assert.equal((await getSetting(TEST_USER_ID, SETTINGS_KEYS.llm)).model, 'gpt-2');
});

test('deletePublicSetting deletes known public settings', async () => {
  await savePublicSettings(TEST_USER_ID, { vectorDb: { provider: 'sqlite' } });
  assert.equal(await deletePublicSetting(TEST_USER_ID, 'vectorDb'), true);
  assert.deepEqual(await getPublicSetting(TEST_USER_ID, 'vectorDb'), { provider: 'sqlite', name: 'SQLite' });
});

test('deletePublicSetting rejects unknown public settings', async () => {
  assert.equal(await deletePublicSetting(TEST_USER_ID, 'unknown'), false);
});

test('getAllPublicSettings returns only supported public keys', async () => {
  await setSetting(TEST_USER_ID, 'test.raw', { hidden: true });
  await savePublicSettings(TEST_USER_ID, { chunking: { strategy: 'fixed' } });
  assert.deepEqual(Object.keys(await getAllPublicSettings(TEST_USER_ID)).sort(), ['chunking', 'vectorDb']);
});
