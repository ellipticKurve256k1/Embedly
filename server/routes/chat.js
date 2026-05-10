import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { DEFAULT_EMBEDDING_MODEL } from '../services/embedder.js';
import { buildChatMessages, rewriteRetrievalQuery, streamOllamaChat } from '../services/llm.js';
import { retrieveChunks, toContextChunk } from '../services/retrieval.js';

const router = express.Router();
const conversations = new Map();
const MAX_HISTORY_MESSAGES = 6;
const CHAT_RETRIEVAL_LIMIT = 3;

function writeSse(response, event, data) {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

function getConversationHistory(conversationId) {
  return conversations.get(conversationId) ?? [];
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

router.post('/', async (request, response) => {
  const message = String(request.body?.message ?? '').trim();
  const model = String(request.body?.model ?? '').trim();
  const embeddingModel = String(request.body?.embeddingModel || DEFAULT_EMBEDDING_MODEL).trim();
  const rawConversationId = request.body?.conversationId;
  const conversationId = (typeof rawConversationId === 'string' && rawConversationId.trim())
    ? rawConversationId.trim()
    : uuidv4();

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

  try {
    const startedAt = performance.now();
    const history = getConversationHistory(conversationId);
    let chunks = [];
    let retrievalQuery = message;
    let rewriteUsed = false;
    let rewriteFailed = false;
    let rewriteMs = null;
    let retrievalMs = null;

    if (history.length > 0) {
      const rewriteStartedAt = performance.now();
      try {
        retrievalQuery = await rewriteRetrievalQuery({ model, message, history });
        rewriteUsed = retrievalQuery !== message;
      } catch (error) {
        rewriteFailed = true;
        retrievalQuery = message;
        console.warn('query rewrite failed', {
          error: error instanceof Error ? error.message : String(error),
          originalQuery: message,
        });
      } finally {
        rewriteMs = Math.round(performance.now() - rewriteStartedAt);
      }
    }

    const retrievalStartedAt = performance.now();
    try {
      chunks = await retrieveChunks(retrievalQuery, {
        model: embeddingModel,
        limit: CHAT_RETRIEVAL_LIMIT,
      });
      writeSse(response, 'context', {
        originalQuery: message,
        rewrittenQuery: retrievalQuery,
        wasRewritten: retrievalQuery !== message,
        chunks: chunks.map(toContextChunk),
      });
    } catch (error) {
      writeSse(response, 'context', {
        originalQuery: message,
        rewrittenQuery: retrievalQuery,
        wasRewritten: retrievalQuery !== message,
        chunks: [],
        error: error instanceof Error ? error.message : 'Context retrieval failed.',
      });
    } finally {
      retrievalMs = Math.round(performance.now() - retrievalStartedAt);
    }

    const messages = buildChatMessages({ message, history, chunks });
    let assistantContent = '';
    let firstTokenAt = null;
    let ollamaStats = null;

    for await (const chunk of streamOllamaChat({ model, messages })) {
      if (typeof chunk !== 'string') {
        ollamaStats = chunk.stats;
        continue;
      }

      firstTokenAt ??= performance.now();
      assistantContent += chunk;
      writeSse(response, 'token', { content: chunk });
    }

    saveConversationTurn(conversationId, message, assistantContent);
    writeSse(response, 'done', { conversationId });

    console.info('chat timing', {
      model,
      chunkCount: chunks.length,
      historyMessages: history.length,
      rewriteUsed,
      rewriteFailed,
      rewriteMs,
      retrievalMs,
      firstTokenMs: firstTokenAt ? Math.round(firstTokenAt - startedAt) : null,
      totalMs: Math.round(performance.now() - startedAt),
      promptEvalCount: ollamaStats?.promptEvalCount,
      evalCount: ollamaStats?.evalCount,
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
