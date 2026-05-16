import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import {
  createProject,
  deleteDocument,
  deleteProject,
  getDocuments,
  getProjects,
  getJobs,
  searchQuery,
  startEmbedding,
  streamChatResponse,
  updateDocumentProject,
  updateProject,
  uploadFiles,
} from './api.js';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

function jsonResponse(payload, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: async () => payload,
  };
}

test('getDocuments returns parsed response', async () => {
  global.fetch = async (url) => {
    assert.match(url, /\/api\/documents$/);
    return jsonResponse({ documents: [] });
  };

  assert.deepEqual(await getDocuments(), { documents: [] });
});

test('getDocuments throws API error message', async () => {
  global.fetch = async () => jsonResponse({ error: 'Nope' }, { ok: false, status: 500 });
  await assert.rejects(() => getDocuments(), /Nope/);
});

test('deleteDocument sends DELETE request', async () => {
  global.fetch = async (url, options) => {
    assert.match(url, /\/api\/documents\/doc-1$/);
    assert.equal(options.method, 'DELETE');
    return jsonResponse({ success: true });
  };

  assert.deepEqual(await deleteDocument('doc-1'), { success: true });
});

test('project APIs send expected requests', async () => {
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    return jsonResponse({ project: { id: 'project-1' }, projects: [] });
  };

  await getProjects();
  await createProject({ name: 'Docs', description: 'Reference' });
  await updateProject('project-1', { name: 'Updated', description: '' });
  await updateDocumentProject('doc-1', 'project-1');
  await deleteProject('project-1');

  assert.match(calls[0].url, /\/api\/projects$/);
  assert.equal(calls[1].options.method, 'POST');
  assert.equal(JSON.parse(calls[1].options.body).name, 'Docs');
  assert.equal(calls[2].options.method, 'PATCH');
  assert.match(calls[2].url, /\/api\/projects\/project-1$/);
  assert.equal(calls[3].options.method, 'PATCH');
  assert.match(calls[3].url, /\/api\/documents\/doc-1$/);
  assert.equal(JSON.parse(calls[3].options.body).projectId, 'project-1');
  assert.equal(calls[4].options.method, 'DELETE');
});

test('startEmbedding sends document ids and chunking config', async () => {
  global.fetch = async (url, options) => {
    assert.match(url, /\/api\/embed$/);
    assert.equal(options.method, 'POST');
    const body = JSON.parse(options.body);
    assert.deepEqual(body.documentIds, ['doc-1']);
    assert.equal(body.chunking.strategy, 'recursive');
    return jsonResponse({ jobId: 'job-1' });
  };

  assert.deepEqual(await startEmbedding(['doc-1']), { jobId: 'job-1' });
});

test('getJobs returns parsed jobs response', async () => {
  global.fetch = async (url) => {
    assert.match(url, /\/api\/jobs$/);
    return jsonResponse({ jobs: [] });
  };

  assert.deepEqual(await getJobs(), { jobs: [] });
});

test('searchQuery encodes query parameter', async () => {
  global.fetch = async (url) => {
    assert.match(url, /\/api\/search\?q=hello\+world/);
    return jsonResponse({ results: [] });
  };

  assert.deepEqual(await searchQuery('hello world'), { results: [] });
});

test('searchQuery includes project filter when provided', async () => {
  global.fetch = async (url) => {
    assert.match(url, /projectId=project-1/);
    return jsonResponse({ results: [] });
  };

  assert.deepEqual(await searchQuery('hello', 'project-1'), { results: [] });
});

test('uploadFiles sends FormData payload', async () => {
  global.fetch = async (url, options) => {
    assert.match(url, /\/api\/upload$/);
    assert.equal(options.method, 'POST');
    assert.ok(options.body instanceof FormData);
    return jsonResponse({ documents: [] });
  };

  const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });
  assert.deepEqual(await uploadFiles([file]), { documents: [] });
});

test('uploadFiles appends optional project id', async () => {
  global.fetch = async (_url, options) => {
    assert.equal(options.body.get('projectId'), 'project-1');
    return jsonResponse({ documents: [] });
  };

  const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });
  assert.deepEqual(await uploadFiles({ files: [file], projectId: 'project-1' }), { documents: [] });
});

test('streamChatResponse emits context, tokens, and done events', async () => {
  const events = [];
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.deepEqual(body.history, [{ role: 'user', content: 'previous' }]);
    assert.equal(body.projectId, 'project-1');
    return ({
    ok: true,
    body: ReadableStream.from([
      Buffer.from('event: context\ndata: {"chunks":[]}\n\n'),
      Buffer.from('event: token\ndata: {"content":"Hi"}\n\n'),
      Buffer.from('event: citations\ndata: {"citedIndices":[0]}\n\n'),
      Buffer.from('event: done\ndata: {"ok":true}\n\n'),
    ]),
    });
  };

  await streamChatResponse({
    message: 'hello',
    conversationId: 'c1',
    history: [{ role: 'user', content: 'previous' }],
    projectId: 'project-1',
    onContext: (data) => events.push(['context', data]),
    onToken: (content) => events.push(['token', content]),
    onCitations: (data) => events.push(['citations', data]),
    onDone: (data) => events.push(['done', data]),
  });

  assert.deepEqual(events, [
    ['context', { chunks: [] }],
    ['token', 'Hi'],
    ['citations', { citedIndices: [0] }],
    ['done', { ok: true }],
  ]);
});

test('streamChatResponse throws on error event', async () => {
  global.fetch = async () => ({
    ok: true,
    body: ReadableStream.from([
      Buffer.from('event: error\ndata: {"error":"failed"}\n\n'),
    ]),
  });

  await assert.rejects(
    () => streamChatResponse({ message: 'hello', conversationId: 'c1' }),
    /failed/,
  );
});

test('streamChatResponse throws when response is not ok', async () => {
  global.fetch = async () => jsonResponse({ error: 'bad chat' }, { ok: false, status: 400 });
  await assert.rejects(
    () => streamChatResponse({ message: 'hello', conversationId: 'c1' }),
    /bad chat/,
  );
});
