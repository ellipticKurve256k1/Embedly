import {
  readSavedChunkingConfig,
  readSavedEmbeddingSetup,
  readSavedLlmSetup,
} from './storage.js';
import { getAuthHeaders } from './auth.js';

const API_BASE = 'http://localhost:3001/api';

async function parseResponse(response) {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || `Request failed with ${response.status}`);
  }

  return payload;
}

export async function uploadFiles(files) {
  const formData = new FormData();
  const hasOptionsShape = files && typeof files === 'object' && Object.prototype.hasOwnProperty.call(files, 'files');
  const fileSource = hasOptionsShape ? files.files : files;
  const fileList = Array.from(fileSource ?? []);
  const projectId = hasOptionsShape ? files.projectId : null;

  fileList.forEach((file) => formData.append('files', file));

  if (projectId) {
    formData.append('projectId', projectId);
  }

  const response = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: formData,
  });

  return parseResponse(response);
}

export async function getDocuments() {
  const response = await fetch(`${API_BASE}/documents`, {
    headers: getAuthHeaders(),
  });
  return parseResponse(response);
}

export async function getDocumentsByProject(projectId) {
  const searchParams = new URLSearchParams();

  if (projectId) {
    searchParams.set('projectId', projectId);
  }

  const queryString = searchParams.toString();
  const response = await fetch(`${API_BASE}/documents${queryString ? `?${queryString}` : ''}`, {
    headers: getAuthHeaders(),
  });
  return parseResponse(response);
}

export async function updateDocumentProject(documentId, projectId) {
  const response = await fetch(`${API_BASE}/documents/${documentId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ projectId: projectId || null }),
  });

  return parseResponse(response);
}

export async function deleteDocument(id) {
  const response = await fetch(`${API_BASE}/documents/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });

  return parseResponse(response);
}

export async function getProjects() {
  const response = await fetch(`${API_BASE}/projects`, {
    headers: getAuthHeaders(),
  });
  return parseResponse(response);
}

export async function createProject({ name, description = '' }) {
  const response = await fetch(`${API_BASE}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ name, description }),
  });

  return parseResponse(response);
}

export async function updateProject(id, { name, description = '' }) {
  const response = await fetch(`${API_BASE}/projects/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ name, description }),
  });

  return parseResponse(response);
}

export async function deleteProject(id) {
  const response = await fetch(`${API_BASE}/projects/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });

  return parseResponse(response);
}

export async function getProjectDocuments(id) {
  const response = await fetch(`${API_BASE}/projects/${id}/documents`, {
    headers: getAuthHeaders(),
  });

  return parseResponse(response);
}

export async function startEmbedding(documentIds) {
  const embeddingSetup = readSavedEmbeddingSetup();
  const response = await fetch(`${API_BASE}/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({
      documentIds,
      model: embeddingSetup?.model,
      chunking: readSavedChunkingConfig(),
    }),
  });

  return parseResponse(response);
}

export async function getJobs() {
  const response = await fetch(`${API_BASE}/jobs`, {
    headers: getAuthHeaders(),
  });
  return parseResponse(response);
}

export async function searchQuery(query, projectId = null) {
  const embeddingSetup = readSavedEmbeddingSetup();
  const searchParams = new URLSearchParams({ q: query });

  if (embeddingSetup?.model) {
    searchParams.set('model', embeddingSetup.model);
  }

  if (projectId) {
    searchParams.set('projectId', projectId);
  }

  const response = await fetch(`${API_BASE}/search?${searchParams.toString()}`, {
    headers: getAuthHeaders(),
  });
  return parseResponse(response);
}

function parseSseMessage(rawMessage) {
  const lines = rawMessage.split('\n');
  let event = 'message';
  const dataLines = [];

  for (const line of lines) {
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trim());
    }
  }

  const dataText = dataLines.join('\n');
  const data = dataText ? JSON.parse(dataText) : {};

  return { event, data };
}

export async function streamChatResponse({
  message,
  conversationId,
  history,
  projectId,
  onContext,
  onCitations,
  onToken,
  onDone,
  onError,
  signal,
}) {
  const llmSetup = readSavedLlmSetup();
  const embeddingSetup = readSavedEmbeddingSetup();
  const response = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    signal,
    body: JSON.stringify({
      message,
      conversationId,
      history: Array.isArray(history) ? history : [],
      llmSetup: llmSetup ?? null,
      embeddingModel: embeddingSetup?.model,
      projectId: projectId || null,
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `Chat failed with ${response.status}`);
  }

  if (!response.body) {
    throw new Error('Chat response stream is unavailable.');
  }

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();

    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const messages = buffer.split('\n\n');
    buffer = messages.pop() ?? '';

    for (const rawMessage of messages) {
      if (!rawMessage.trim()) continue;

      const { event, data } = parseSseMessage(rawMessage);

      if (event === 'token') {
        onToken?.(data.content ?? '');
      } else if (event === 'context') {
        onContext?.(data);
      } else if (event === 'citations') {
        onCitations?.(data);
      } else if (event === 'done') {
        onDone?.(data);
      } else if (event === 'error') {
        const error = new Error(data.error || 'Chat generation failed.');
        onError?.(error);
        throw error;
      }
    }
  }

  if (buffer.trim()) {
    const { event, data } = parseSseMessage(buffer);
    if (event === 'done') {
      onDone?.(data);
    } else if (event === 'context') {
      onContext?.(data);
    } else if (event === 'citations') {
      onCitations?.(data);
    }
  }
}
