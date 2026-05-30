import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { DEFAULT_EMBEDDING_MODEL } from '../services/embedder.js';
import {
  buildChatMessages,
  detectCitedSources,
  rewriteRetrievalQuery,
  streamChat,
} from '../services/llm.js';
import { isRerankerEnabled } from '../services/reranker.js';
import { retrieveChunks, toContextChunk } from '../services/retrieval.js';
import {
  getEmbeddingSetup,
  getLlmSetup,
  getRerankerSetup,
  isMaskedApiKey,
} from '../services/settings.js';

const router = express.Router();
const conversations = new Map();
const MAX_HISTORY_MESSAGES = 6;
const CHAT_CANDIDATE_LIMIT = 20;
const CHAT_RETRIEVAL_LIMIT = 5;

function writeSse(response, event, data) {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

export function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];

  return history
    .filter((message) => (
      message
      && (message.role === 'user' || message.role === 'assistant')
      && typeof message.content === 'string'
      && message.content.trim()
    ))
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
    }))
    .slice(-MAX_HISTORY_MESSAGES);
}

export function getConversationHistory(conversationId, bodyHistory = []) {
  if (conversations.has(conversationId)) {
    return conversations.get(conversationId);
  }

  const sanitizedHistory = sanitizeHistory(bodyHistory);
  if (sanitizedHistory.length > 0) {
    conversations.set(conversationId, sanitizedHistory);
    return sanitizedHistory;
  }

  return [];
}

export function clearConversationCacheForTests() {
  conversations.clear();
}

function saveConversationTurn(conversationId, message, assistantContent) {
  const currentHistory = getConversationHistory(conversationId);
  const nextHistory = [
    ...currentHistory,
    { role: 'user', content: message },
    { role: 'assistant', content: assistantContent },
  ].slice(-MAX_HISTORY_MESSAGES);

  conversations.set(conversationId, nextHistory);
}

function computeAverageScore(chunkList) {
  if (chunkList.length === 0) return 0;
  return chunkList.reduce((sum, chunk) => sum + (chunk.rerankScore ?? chunk.score ?? 0), 0)
    / chunkList.length;
}

function selectBetterChunks(originalChunks, rewrittenChunks) {
  if (rewrittenChunks.length === 0) return originalChunks;
  if (originalChunks.length === 0) return rewrittenChunks;

  const originalScore = computeAverageScore(originalChunks);
  const rewrittenScore = computeAverageScore(rewrittenChunks);

  return rewrittenScore > originalScore ? rewrittenChunks : originalChunks;
}

function buildContextEvent({
  message,
  retrievalQuery,
  rewriteUsed,
  chunks,
  rerankerSetup,
  candidateLimit,
  topK,
  projectId,
  error,
}) {
  const rerankerEnabled = isRerankerEnabled(rerankerSetup);
  const rerankerUsed = rerankerEnabled
    && chunks.some((chunk) => typeof chunk.rerankScore === 'number');

  return {
    originalQuery: message,
    rewrittenQuery: retrievalQuery,
    wasRewritten: rewriteUsed,
    chunks: chunks.map(toContextChunk),
    citedIndices: [],
    ...(error ? { error } : {}),
    rerankerUsed,
    rerankerModel: rerankerUsed ? rerankerSetup.model : null,
    rerankerEnabled,
    candidateLimit,
    topK,
    projectId,
  };
}

router.post('/', async (request, response) => {
  const message = String(request.body?.message ?? '').trim();
  const userId = String(request.userId ?? '').trim();
  const savedLlmSetup = await getLlmSetup(userId, request.authToken) ?? {};
  const rawLlmSetup = request.body?.llmSetup && typeof request.body.llmSetup === 'object'
    ? request.body.llmSetup
    : {};
  const provider = (rawLlmSetup.provider ?? savedLlmSetup.provider) === 'api' ? 'api' : 'ollama';
  const model = String(rawLlmSetup.model ?? request.body?.model ?? savedLlmSetup.model ?? '').trim();
  const endpoint = String(rawLlmSetup.endpoint ?? savedLlmSetup.endpoint ?? '').trim();
  const requestedApiKey = String(rawLlmSetup.apiKey ?? '').trim();
  const savedApiKey = String(savedLlmSetup.apiKey ?? '').trim();
  const apiKey = requestedApiKey && !isMaskedApiKey(requestedApiKey)
    ? requestedApiKey
    : savedApiKey;
  const llmConfig = { provider, model, endpoint, apiKey };
  const savedEmbeddingSetup = await getEmbeddingSetup(userId, request.authToken) ?? {};
  const embeddingModel = String(
    request.body?.embeddingModel
      || savedEmbeddingSetup.model
      || DEFAULT_EMBEDDING_MODEL,
  ).trim();
  const rawConversationId = request.body?.conversationId;
  const conversationId = (typeof rawConversationId === 'string' && rawConversationId.trim())
    ? rawConversationId.trim()
    : uuidv4();
  const bodyHistory = sanitizeHistory(request.body?.history);
  const projectId = String(request.body?.projectId ?? '').trim() || null;
  const rerankerSetup = await getRerankerSetup(userId, request.authToken) ?? {};
  const candidateLimit = rerankerSetup.candidateLimit ?? CHAT_CANDIDATE_LIMIT;
  const topK = rerankerSetup.topK ?? CHAT_RETRIEVAL_LIMIT;
  const retrievalOptions = {
    model: embeddingModel,
    candidateLimit,
    topK,
    reranker: isRerankerEnabled(rerankerSetup) ? rerankerSetup : null,
    projectId,
    userId,
    accessToken: request.authToken ?? null,
  };

  response.setHeader('Content-Type', 'text/event-stream');
  response.setHeader('Cache-Control', 'no-cache, no-transform');
  response.setHeader('Connection', 'keep-alive');
  response.flushHeaders?.();

  if (!message) {
    writeSse(response, 'error', { error: 'Message is required.' });
    response.end();
    return;
  }

  if (!model) {
    writeSse(response, 'error', {
      error: 'LLM model is not configured. Open Settings and choose a generation model.',
    });
    response.end();
    return;
  }

  if (provider === 'api' && (!endpoint || !apiKey)) {
    writeSse(response, 'error', {
      error: !endpoint
        ? 'External API endpoint is not configured. Open Settings and add an endpoint URL.'
        : 'External API key is not configured. Open Settings and add an API key.',
    });
    response.end();
    return;
  }

  try {
    const startedAt = performance.now();
    const history = getConversationHistory(conversationId, bodyHistory);
    let chunks = [];
    let retrievalQuery = message;
    let rewriteUsed = false;
    let rewriteFailed = false;
    let rewriteMs = null;
    let retrievalMs = null;

    if (history.length > 0) {
      const rewriteStartedAt = performance.now();

      try {
        // Run retrieval with ORIGINAL query AND rewrite in parallel
        const originalRetrieval = retrieveChunks(message, {
          ...retrievalOptions,
        });
        const rewritePromise = rewriteRetrievalQuery({
          ...llmConfig,
          message,
          history,
        });

        const [originalChunksResult, rewrittenQuery] = await Promise.allSettled([
          originalRetrieval,
          rewritePromise,
        ]);

        rewriteMs = Math.round(performance.now() - rewriteStartedAt);

        const originalChunks = originalChunksResult.status === 'fulfilled'
          ? originalChunksResult.value
          : [];

        const validRewrittenQuery = rewrittenQuery.status === 'fulfilled'
          ? rewrittenQuery.value
          : message;

        rewriteFailed = rewrittenQuery.status === 'rejected';

        if (rewriteFailed) {
          console.warn('query rewrite failed', {
            error: rewrittenQuery.reason instanceof Error
              ? rewrittenQuery.reason.message
              : String(rewrittenQuery.reason),
            originalQuery: message,
          });
        }

        // If rewrite produced different query, re-retrieve and select best chunks
        if (validRewrittenQuery !== message) {
          const rewrittenChunks = await retrieveChunks(validRewrittenQuery, {
            ...retrievalOptions,
          });
          chunks = selectBetterChunks(originalChunks, rewrittenChunks);
          retrievalQuery = validRewrittenQuery;
          rewriteUsed = true;
        } else {
          chunks = originalChunks;
          retrievalQuery = message;
        }
      } catch (error) {
        // Fallback: use original message if parallel execution fails entirely
        rewriteFailed = true;
        retrievalQuery = message;
        rewriteMs = Math.round(performance.now() - rewriteStartedAt);
        console.warn('parallel rewrite/retrieval failed', {
          error: error instanceof Error ? error.message : String(error),
          originalQuery: message,
        });
      }
    } else {
      // No history: simple direct retrieval
      const retrievalStartedAt = performance.now();
      try {
        chunks = await retrieveChunks(message, {
          ...retrievalOptions,
        });
      } catch (error) {
        writeSse(response, 'context', buildContextEvent({
          message,
          retrievalQuery: message,
          rewriteUsed: false,
          chunks: [],
          rerankerSetup,
          candidateLimit,
          topK,
          projectId,
          error: error instanceof Error ? error.message : 'Context retrieval failed.',
        }));
        response.end();
        return;
      } finally {
        retrievalMs = Math.round(performance.now() - retrievalStartedAt);
      }
    }

    // Send context event (for non-first-message cases, we already have chunks)
    if (history.length === 0) {
      writeSse(response, 'context', buildContextEvent({
        message,
        retrievalQuery,
        rewriteUsed: false,
        chunks,
        rerankerSetup,
        candidateLimit,
        topK,
        projectId,
      }));
    } else {
      writeSse(response, 'context', buildContextEvent({
        message,
        retrievalQuery,
        rewriteUsed,
        chunks,
        rerankerSetup,
        candidateLimit,
        topK,
        projectId,
      }));
    }

    const messages = buildChatMessages({ message, history, chunks });
    let assistantContent = '';
    let firstTokenAt = null;
    let generationStats = null;

    for await (const chunk of streamChat({ ...llmConfig, messages })) {
      if (typeof chunk !== 'string') {
        generationStats = chunk.stats;
        continue;
      }

      firstTokenAt ??= performance.now();
      assistantContent += chunk;
      writeSse(response, 'token', { content: chunk });
    }

    saveConversationTurn(conversationId, message, assistantContent);
    const citedIndices = detectCitedSources(assistantContent, chunks);
    writeSse(response, 'citations', { citedIndices });
    writeSse(response, 'done', { conversationId, citedIndices });

    console.info('chat timing', {
      provider,
      model,
      chunkCount: chunks.length,
      rerankerUsed: chunks.some((chunk) => typeof chunk.rerankScore === 'number'),
      historyMessages: history.length,
      rewriteUsed,
      rewriteFailed,
      rewriteMs,
      retrievalMs,
      firstTokenMs: firstTokenAt ? Math.round(firstTokenAt - startedAt) : null,
      totalMs: Math.round(performance.now() - startedAt),
      promptEvalCount: generationStats?.promptEvalCount,
      evalCount: generationStats?.evalCount,
    });
  } catch (error) {
    writeSse(response, 'error', {
      error: error instanceof Error ? error.message : 'Chat generation failed.',
    });
  } finally {
    response.end();
  }
});

export default router;
