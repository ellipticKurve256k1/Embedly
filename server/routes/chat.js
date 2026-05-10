import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { buildChatMessages, streamOllamaChat } from '../services/llm.js';

const router = express.Router();
const conversations = new Map();
const MAX_HISTORY_MESSAGES = 10;

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
  const conversationId = String(request.body?.conversationId ?? '').trim() || uuidv4();
  const chunks = Array.isArray(request.body?.context?.chunks)
    ? request.body.context.chunks
    : [];

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
    const history = getConversationHistory(conversationId);
    const messages = buildChatMessages({ message, history, chunks });
    let assistantContent = '';

    for await (const token of streamOllamaChat({ model, messages })) {
      assistantContent += token;
      writeSse(response, 'token', { content: token });
    }

    saveConversationTurn(conversationId, message, assistantContent);
    writeSse(response, 'done', { conversationId });
  } catch (error) {
    writeSse(response, 'error', {
      error: error instanceof Error ? error.message : 'Chat generation failed.',
    });
  } finally {
    response.end();
  }
});

export default router;
