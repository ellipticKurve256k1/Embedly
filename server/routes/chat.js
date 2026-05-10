import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { DEFAULT_EMBEDDING_MODEL } from '../services/embedder.js';
import { buildChatMessages, streamOllamaChat } from '../services/llm.js';
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
  const conversationId = String(request.body?.conversationId ?? '').trim() || uuidv4();

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
    let chunks = [];
    try {
      chunks = await retrieveChunks(message, {
        model: embeddingModel,
        limit: CHAT_RETRIEVAL_LIMIT,
      });
      writeSse(response, 'context', { chunks: chunks.map(toContextChunk) });
    } catch (error) {
      writeSse(response, 'context', {
        chunks: [],
        error: error instanceof Error ? error.message : 'Context retrieval failed.',
      });
    }

    const history = getConversationHistory(conversationId);
    const messages = buildChatMessages({ message, history, chunks });
    let assistantContent = '';
    const startedAt = performance.now();
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
