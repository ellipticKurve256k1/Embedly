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
  persistConversationStart,
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

test('saveConversation preserves provided updatedAt value', async () => {
  await saveConversation({
    id: 'stable',
    title: 'Stable',
    messages: [{ id: 'm1', role: 'user', content: 'hello', createdAt: '2026-01-01T00:00:00.000Z' }],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  });
  await new Promise((resolve) => setTimeout(resolve, 2));
  await saveConversation({
    id: 'stable',
    title: 'Stable after select',
    messages: [{ id: 'm1', role: 'user', content: 'hello', createdAt: '2026-01-01T00:00:00.000Z' }],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  });

  const conversation = await getConversation('stable');
  assert.equal(conversation.title, 'Stable after select');
  assert.equal(conversation.updatedAt, '2026-01-02T00:00:00.000Z');
});

test('persistConversationStart creates a minimal conversation with generated title', async () => {
  const savedConversation = await persistConversationStart(
    'started',
    'How do I configure routing in React?',
    'project-1',
  );

  assert.equal(savedConversation.id, 'started');
  assert.equal(savedConversation.title, 'How do I configure routing in React?');
  assert.equal(savedConversation.projectId, 'project-1');
  assert.equal(savedConversation.messages.length, 1);
  assert.equal(savedConversation.messages[0].role, 'user');
  assert.equal(savedConversation.messages[0].content, 'How do I configure routing in React?');

  const conversations = await getAllConversations();
  assert.equal(conversations.length, 1);
  assert.equal(conversations[0].id, 'started');
});

test('persistConversationStart handles empty first messages', async () => {
  const savedConversation = await persistConversationStart('empty', '', null);

  assert.equal(savedConversation.title, 'New Chat');
  assert.equal(savedConversation.projectId, null);
  assert.deepEqual(
    savedConversation.messages.map((message) => ({ role: message.role, content: message.content })),
    [{ role: 'user', content: '' }],
  );
});

test('persistConversationStart uses the memory fallback when IndexedDB is unavailable', async () => {
  await persistConversationStart('memory-only', 'Stored without IndexedDB', null);

  const conversation = await getConversation('memory-only');
  assert.equal(conversation.title, 'Stored without IndexedDB');
  assert.equal(conversation.messages.length, 1);
});

test('persistConversationStart can be safely upserted with a completed conversation', async () => {
  await persistConversationStart('upsert', 'Start this chat', 'project-2');

  await saveConversation({
    id: 'upsert',
    title: 'Start this chat',
    projectId: 'project-2',
    messages: [
      { id: 'm1', role: 'user', content: 'Start this chat', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'm2', role: 'assistant', content: 'Completed response', createdAt: '2026-01-01T00:00:01.000Z' },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:01.000Z',
  });

  const conversations = await getAllConversations();
  assert.equal(conversations.length, 1);
  assert.equal(conversations[0].id, 'upsert');
  assert.equal(conversations[0].projectId, 'project-2');
  assert.deepEqual(
    conversations[0].messages.map((message) => message.content),
    ['Start this chat', 'Completed response'],
  );
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
