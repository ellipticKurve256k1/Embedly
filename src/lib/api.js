import {
  readSavedChunkingConfig,
  readSavedEmbeddingSetup,
} from './storage.js';

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
  files.forEach((file) => formData.append('files', file));

  const response = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    body: formData,
  });

  return parseResponse(response);
}

export async function getDocuments() {
  const response = await fetch(`${API_BASE}/documents`);
  return parseResponse(response);
}

export async function deleteDocument(id) {
  const response = await fetch(`${API_BASE}/documents/${id}`, {
    method: 'DELETE',
  });

  return parseResponse(response);
}

export async function startEmbedding(documentIds) {
  const embeddingSetup = readSavedEmbeddingSetup();
  const response = await fetch(`${API_BASE}/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      documentIds,
      model: embeddingSetup?.model,
      chunking: readSavedChunkingConfig(),
    }),
  });

  return parseResponse(response);
}

export async function getJobs() {
  const response = await fetch(`${API_BASE}/jobs`);
  return parseResponse(response);
}

export async function searchQuery(query) {
  const embeddingSetup = readSavedEmbeddingSetup();
  const searchParams = new URLSearchParams({ q: query });

  if (embeddingSetup?.model) {
    searchParams.set('model', embeddingSetup.model);
  }

  const response = await fetch(`${API_BASE}/search?${searchParams.toString()}`);
  return parseResponse(response);
}
