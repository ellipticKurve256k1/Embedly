import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import {
  clearConversationCacheForTests,
  getConversationHistory,
  sanitizeHistory,
} from './chat.js';

beforeEach(() => {
  clearConversationCacheForTests();
});

test('sanitizeHistory keeps only valid recent chat messages', () => {
  const history = sanitizeHistory([
    { role: 'system', content: 'ignore' },
    { role: 'user', content: 'one' },
    { role: 'assistant', content: 'two' },
    { role: 'user', content: 'three' },
    { role: 'assistant', content: 'four' },
    { role: 'user', content: 'five' },
    { role: 'assistant', content: 'six' },
    { role: 'user', content: 'seven' },
    { role: 'assistant', content: '' },
    null,
  ]);

  assert.deepEqual(history, [
    { role: 'assistant', content: 'two' },
    { role: 'user', content: 'three' },
    { role: 'assistant', content: 'four' },
    { role: 'user', content: 'five' },
    { role: 'assistant', content: 'six' },
    { role: 'user', content: 'seven' },
  ]);
});

test('getConversationHistory rehydrates cache from body history on miss', () => {
  const bodyHistory = [
    { role: 'user', content: 'previous question' },
    { role: 'assistant', content: 'previous answer' },
  ];

  const firstRead = getConversationHistory('c1', bodyHistory);
  const secondRead = getConversationHistory('c1');

  assert.deepEqual(firstRead, bodyHistory);
  assert.deepEqual(secondRead, bodyHistory);
});

test('getConversationHistory prefers hot cache when present', () => {
  getConversationHistory('c1', [{ role: 'user', content: 'cached' }]);

  assert.deepEqual(
    getConversationHistory('c1', [{ role: 'user', content: 'new body' }]),
    [{ role: 'user', content: 'cached' }],
  );
});
