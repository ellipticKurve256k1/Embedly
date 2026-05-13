import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import {
  MAX_MESSAGES_PER_CONVERSATION,
  clearChatStorageForTests,
  deleteConversation,
  generateTitle,
  getAllConversations,
  getChatState,
  getConversation,
  pruneOldConversations,
  saveConversation,
  setChatState,
  trimConversationMessages,
} from './chatDB.js';

beforeEach(() => {
  clearChatStorageForTests();
});

test('generateTitle returns "New Chat" for empty input', () => {
  assert.equal(generateTitle(''), 'New Chat');
  assert.equal(generateTitle(null), 'New Chat');
  assert.equal(generateTitle(undefined), 'New Chat');
  assert.equal(generateTitle('   '), 'New Chat');
});

test('generateTitle truncates long messages to 40 chars', () => {
  const long = 'This is a very long message that exceeds forty characters and should be truncated';
  const result = generateTitle(long);
  assert.ok(result.endsWith('...'));
  assert.equal(result.length, 43);
});

test('generateTitle returns exact text for short messages', () => {
  const short = 'Hello world';
  assert.equal(generateTitle(short), short);
});

test('generateTitle trims whitespace', () => {
  assert.equal(generateTitle('  Hello  '), 'Hello');
  assert.equal(generateTitle('  Long message that exceeds forty characters here  ').endsWith('...'), true);
});

test('saveConversation stores conversations sorted by updatedAt descending', async () => {
  await saveConversation({
    id: 'older',
    title: 'Older',
    messages: [{ id: 'm1', role: 'user', content: 'older', createdAt: '2026-01-01T00:00:00.000Z' }],
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  await new Promise((resolve) => setTimeout(resolve, 2));
  await saveConversation({
    id: 'newer',
    title: 'Newer',
    messages: [{ id: 'm2', role: 'user', content: 'newer', createdAt: '2026-01-02T00:00:00.000Z' }],
    createdAt: '2026-01-02T00:00:00.000Z',
  });

  const conversations = await getAllConversations();
  assert.deepEqual(conversations.map((conversation) => conversation.id), ['newer', 'older']);
  assert.equal((await getConversation('older')).title, 'Older');
});

test('deleteConversation removes a conversation', async () => {
  await saveConversation({
    id: 'delete-me',
    title: 'Delete me',
    messages: [{ id: 'm1', role: 'user', content: 'hello', createdAt: '2026-01-01T00:00:00.000Z' }],
  });

  assert.equal(await deleteConversation('delete-me'), true);
  assert.equal(await getConversation('delete-me'), undefined);
});

test('chat state can be saved and loaded', async () => {
  assert.equal(await setChatState('activeConversationId', 'c1'), true);
  assert.equal(await getChatState('activeConversationId'), 'c1');
  assert.equal(await getChatState('missing', 'fallback'), 'fallback');
});

test('pruneOldConversations deletes oldest conversations', async () => {
  for (let index = 0; index < 4; index += 1) {
    await saveConversation({
      id: `c${index}`,
      title: `Chat ${index}`,
      messages: [{ id: `m${index}`, role: 'user', content: `message ${index}`, createdAt: '2026-01-01T00:00:00.000Z' }],
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    await new Promise((resolve) => setTimeout(resolve, 2));
  }

  assert.equal(await pruneOldConversations(2), 2);
  const conversations = await getAllConversations();
  assert.deepEqual(conversations.map((conversation) => conversation.id), ['c3', 'c2']);
});

test('trimConversationMessages keeps the most recent messages', () => {
  const messages = Array.from({ length: MAX_MESSAGES_PER_CONVERSATION + 4 }, (_, index) => ({
    id: `m${index}`,
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: `message ${index}`,
    createdAt: '2026-01-01T00:00:00.000Z',
  }));

  const trimmed = trimConversationMessages(messages);
  assert.equal(trimmed.length, MAX_MESSAGES_PER_CONVERSATION);
  assert.equal(trimmed[0].id, 'm4');
});
