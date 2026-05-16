import path from 'node:path';

export const DEFAULT_RERANKER_MODEL = 'Xenova/bge-reranker-v2-m3';
export const DEFAULT_RERANKER_CONFIG = {
  enabled: false,
  model: DEFAULT_RERANKER_MODEL,
  candidateLimit: 20,
  topK: 5,
};

const RERANKER_CACHE_DIR = process.env.TRANSFORMERS_CACHE
  ?? path.join(process.cwd(), 'server', '.models');

let transformersModulePromise = null;
let pipelineFactoryOverride = null;
let hasLoggedLoadFailure = false;
const rerankerPipelines = new Map();

async function loadTransformersModule() {
  if (pipelineFactoryOverride) {
    return { pipeline: pipelineFactoryOverride, env: null };
  }

  transformersModulePromise ??= import('@xenova/transformers').then((module) => {
    module.env.cacheDir = RERANKER_CACHE_DIR;
    return module;
  });

  return transformersModulePromise;
}

async function getRerankerPipeline(model = DEFAULT_RERANKER_MODEL) {
  const modelName = String(model || DEFAULT_RERANKER_MODEL).trim() || DEFAULT_RERANKER_MODEL;

  if (rerankerPipelines.has(modelName)) {
    return rerankerPipelines.get(modelName);
  }

  const { pipeline } = await loadTransformersModule();
  const nextPipeline = await pipeline('text-classification', modelName, { quantized: true });
  rerankerPipelines.set(modelName, nextPipeline);
  return nextPipeline;
}

function clampScore(value) {
  const score = Number(value);

  if (!Number.isFinite(score)) {
    return 0.5;
  }

  return Math.max(0, Math.min(1, score));
}

function extractScore(result) {
  const firstResult = Array.isArray(result) ? result[0] : result;
  const firstNestedResult = Array.isArray(firstResult) ? firstResult[0] : firstResult;
  return clampScore(firstNestedResult?.score);
}

function toRerankerInput(query, document) {
  const content = String(document?.content ?? document?.preview ?? '').replace(/\s+/g, ' ').trim();
  return `${query} [SEP] ${content}`;
}

function logRerankerLoadFailure(error) {
  if (hasLoggedLoadFailure) {
    return;
  }

  hasLoggedLoadFailure = true;
  console.warn('reranker unavailable; falling back to embedding similarity', {
    error: error instanceof Error ? error.message : String(error),
  });
}

export function isRerankerEnabled(config) {
  return config?.enabled === true;
}

export async function rerankDocuments(query, documents, config = {}) {
  const normalizedDocuments = Array.isArray(documents) ? documents : [];
  const normalizedQuery = String(query ?? '').trim();

  if (!isRerankerEnabled(config) || normalizedDocuments.length === 0 || !normalizedQuery) {
    return normalizedDocuments;
  }

  let classifier;
  try {
    classifier = await getRerankerPipeline(config.model);
  } catch (error) {
    logRerankerLoadFailure(error);
    return normalizedDocuments;
  }

  const scoredDocuments = await Promise.all(
    normalizedDocuments.map(async (document) => {
      try {
        const result = await classifier(toRerankerInput(normalizedQuery, document), {
          truncation: true,
          max_length: 512,
        });

        return {
          ...document,
          rerankScore: extractScore(result),
        };
      } catch {
        return {
          ...document,
          rerankScore: 0.5,
        };
      }
    }),
  );

  return scoredDocuments.sort((left, right) => {
    const scoreDelta = right.rerankScore - left.rerankScore;
    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    return (right.score ?? 0) - (left.score ?? 0);
  });
}

export async function initializeReranker(model = DEFAULT_RERANKER_MODEL) {
  await getRerankerPipeline(model);
}

export function clearRerankerCache() {
  rerankerPipelines.clear();
  transformersModulePromise = null;
  hasLoggedLoadFailure = false;
}

export function setRerankerPipelineFactoryForTests(factory) {
  pipelineFactoryOverride = typeof factory === 'function' ? factory : null;
  clearRerankerCache();
}
