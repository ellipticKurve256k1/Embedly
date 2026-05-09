const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
export const DEFAULT_EMBEDDING_MODEL = 'nomic-embed-text';

export function vectorToBlob(vector) {
  const floatVector = Float32Array.from(vector);
  return Buffer.from(floatVector.buffer);
}

export function blobToVector(blob) {
  return new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / Float32Array.BYTES_PER_ELEMENT);
}

export async function embedText(text, model = DEFAULT_EMBEDDING_MODEL) {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: text }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Ollama embed failed (${response.status}): ${message}`);
  }

  const payload = await response.json();
  const vector = Array.isArray(payload.embeddings?.[0])
    ? payload.embeddings[0]
    : payload.embedding;

  if (!Array.isArray(vector) || vector.length === 0) {
    throw new Error('Ollama returned an empty embedding vector.');
  }

  return vector;
}

export function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
