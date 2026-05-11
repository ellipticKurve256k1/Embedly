import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import {
  buildChatMessages,
  buildContextBlock,
  cleanRewriteResponse,
  isValidRetrievalQuery,
  rewriteRetrievalQuery,
  streamChat,
  streamOllamaChat,
} from './llm.js';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

test('isValidRetrievalQuery rejects empty string', () => {
  assert.equal(isValidRetrievalQuery(''), false);
});

test('isValidRetrievalQuery rejects short queries', () => {
  assert.equal(isValidRetrievalQuery('hi'), false);
});

test('isValidRetrievalQuery rejects assistant-style prefixes', () => {
  assert.equal(isValidRetrievalQuery('Based on the context'), false);
});

test('isValidRetrievalQuery accepts concrete user questions', () => {
  assert.equal(isValidRetrievalQuery('What does the upload flow do?'), true);
});

test('cleanRewriteResponse strips labels and quotes', () => {
  assert.equal(cleanRewriteResponse('"Search query: upload flow"'), 'upload flow');
});

test('cleanRewriteResponse trims whitespace', () => {
  assert.equal(cleanRewriteResponse('  standalone search query: settings page  '), 'settings page');
});

test('buildContextBlock formats source metadata', () => {
  const block = buildContextBlock([{
    documentName: 'notes.md',
    chunkIndex: 0,
    score: 0.93456,
    content: 'Embeddly stores settings.',
  }]);

  assert.match(block, /Source 1/);
  assert.match(block, /Document: notes\.md/);
  assert.match(block, /Similarity: 0\.935/);
  assert.match(block, /Embeddly stores settings/);
});

test('buildContextBlock handles empty input', () => {
  assert.equal(buildContextBlock([]), '');
});

test('buildContextBlock limits number of chunks', () => {
  const block = buildContextBlock(Array.from({ length: 8 }, (_, index) => ({
    documentName: `doc-${index}.txt`,
    chunkIndex: index,
    score: 0.5,
    content: `content ${index}`,
  })));

  assert.match(block, /Source 5/);
  assert.doesNotMatch(block, /Source 6/);
});

test('buildChatMessages includes system message and user message', () => {
  const messages = buildChatMessages({ message: 'Hello', chunks: [] });
  assert.equal(messages[0].role, 'system');
  assert.equal(messages.at(-1).role, 'user');
  assert.equal(messages.at(-1).content, 'Hello');
});

test('buildChatMessages includes retrieved context', () => {
  const messages = buildChatMessages({
    message: 'What is stored?',
    chunks: [{ documentName: 'a.txt', chunkIndex: 0, score: 1, content: 'Private notes.' }],
  });
  assert.match(messages[0].content, /Private notes/);
  assert.match(messages[0].content, /Source 1/);
});

test('rewriteRetrievalQuery returns original message with empty history', async () => {
  const result = await rewriteRetrievalQuery({ model: 'model', message: 'follow up?', history: [] });
  assert.equal(result, 'follow up?');
});

test('rewriteRetrievalQuery uses API rewritten query when valid', async () => {
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: 'Search query: uploaded PDFs' } }] }),
  });

  const result = await rewriteRetrievalQuery({
    provider: 'api',
    model: 'model',
    endpoint: 'https://example.test/v1',
    apiKey: 'secret',
    message: 'What about those?',
    history: [{ role: 'user', content: 'Tell me about uploaded PDFs' }],
  });

  assert.equal(result, 'uploaded PDFs');
});

test('rewriteRetrievalQuery falls back when rewritten query is invalid', async () => {
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ message: { content: 'I cannot answer that.' } }),
  });

  const result = await rewriteRetrievalQuery({
    model: 'model',
    message: 'What about it?',
    history: [{ role: 'user', content: 'Discuss settings' }],
  });

  assert.equal(result, 'What about it?');
});

test('streamOllamaChat yields token content from JSON lines', async () => {
  global.fetch = async () => ({
    ok: true,
    body: ReadableStream.from([
      Buffer.from('{"message":{"content":"Hi"},"done":false}\n'),
      Buffer.from('{"done":true}\n'),
    ]),
  });

  const tokens = [];
  for await (const event of streamOllamaChat({ model: 'm', messages: [] })) {
    tokens.push(event);
  }

  assert.equal(tokens[0], 'Hi');
  assert.equal(tokens[1].type, 'stats');
});

test('streamChat yields API token content from SSE events', async () => {
  global.fetch = async () => ({
    ok: true,
    body: ReadableStream.from([
      Buffer.from('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n'),
      Buffer.from('data: [DONE]\n\n'),
    ]),
  });

  const tokens = [];
  for await (const event of streamChat({
    provider: 'api',
    model: 'm',
    endpoint: 'https://example.test/v1',
    apiKey: 'secret',
    messages: [],
  })) {
    tokens.push(event);
  }

  assert.equal(tokens[0], 'Hi');
  assert.equal(tokens[1].type, 'stats');
});
