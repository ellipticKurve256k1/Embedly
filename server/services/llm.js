const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';

const MAX_CONTEXT_CHUNKS = 3;
const MAX_CONTEXT_CHARS = 3500;
const MAX_CHUNK_CHARS = 1000;
const MAX_REWRITE_HISTORY_MESSAGES = 6;
const MAX_REWRITE_HISTORY_CHARS = 2200;
const MAX_REWRITE_USER_MESSAGE_CHARS = 300;
const MAX_REWRITE_ASSISTANT_MESSAGE_CHARS = 150;
const OLLAMA_KEEP_ALIVE = process.env.OLLAMA_KEEP_ALIVE ?? '30m';

function readNumberEnv(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) ? value : fallback;
}

const OLLAMA_NUM_CTX = readNumberEnv('OLLAMA_NUM_CTX', 4096);
const OLLAMA_NUM_PREDICT = readNumberEnv('OLLAMA_NUM_PREDICT', 384);
const OLLAMA_TEMPERATURE = readNumberEnv('OLLAMA_TEMPERATURE', 0.2);
const OLLAMA_REWRITE_TIMEOUT_MS = readNumberEnv('OLLAMA_REWRITE_TIMEOUT_MS', 3000);

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function formatScore(score) {
  return typeof score === 'number' ? score.toFixed(3) : 'unknown';
}

function createTimeoutSignal(timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout),
  };
}

function formatRewriteHistory(history = []) {
  const recentHistory = history.slice(-MAX_REWRITE_HISTORY_MESSAGES);
  const formattedLines = [];

  for (const message of recentHistory) {
    const role = message.role === 'assistant' ? 'Assistant' : 'User';
    const content = cleanText(message.content);

    if (!content) continue;

    const maxChars = message.role === 'user'
      ? MAX_REWRITE_USER_MESSAGE_CHARS
      : MAX_REWRITE_ASSISTANT_MESSAGE_CHARS;

    const clippedContent = content.slice(0, maxChars);
    formattedLines.push(`${role}: ${clippedContent}`);
  }

  return formattedLines.join('\n');
}

function cleanRewriteResponse(value) {
  return cleanText(value)
    .replace(/^["'`]+|"['`]+$/g, '')
    .replace(/^standalone search query:\s*/i, '')
    .replace(/^search query:\s*/i, '')
    .trim();
}

function isValidRetrievalQuery(query) {
  if (!query || query.length < 3) {
    return false;
  }

  const lowerQuery = query.toLowerCase();
  const invalidPrefixes = [
    'i ',
    "i'm ",
    'i am ',
    'the ',
    'based on ',
    'according to ',
    'as an ',
    'as a ',
    'sorry',
    'i apologize',
    'i cannot',
    "i can't",
    'i do not',
    "i don't",
    'i would',
    'i will',
    'let me',
    'here is',
    'here are',
  ];

  return !invalidPrefixes.some((prefix) => lowerQuery.startsWith(prefix));
}

function buildContextBlock(chunks = []) {
  const normalizedChunks = Array.isArray(chunks) ? chunks : [];
  let contextLength = 0;

  return normalizedChunks
    .slice(0, MAX_CONTEXT_CHUNKS)
    .map((chunk, index) => {
      const content = cleanText(chunk.content).slice(0, MAX_CHUNK_CHARS);

      if (!content || contextLength >= MAX_CONTEXT_CHARS) {
        return null;
      }

      const remainingLength = MAX_CONTEXT_CHARS - contextLength;
      const clippedContent = content.slice(0, remainingLength);
      contextLength += clippedContent.length;

      return [
        `Source ${index + 1}`,
        `Document: ${chunk.documentName || 'Untitled document'}`,
        `Chunk: ${chunk.chunkIndex != null ? chunk.chunkIndex + 1 : 'unknown'}`,
        `Similarity: ${formatScore(chunk.score)}`,
        `Content: ${clippedContent}`,
      ].join('\n');
    })
    .filter(Boolean)
    .join('\n\n');
}

export function buildChatMessages({ message, history = [], chunks = [] }) {
  const contextBlock = buildContextBlock(chunks);
  const systemContent = [
    'You are Embeddly, a local knowledge-base assistant.',
    '',
    '## CRITICAL: Citation Rules',
    '',
    'You MUST cite your sources using [Source N] after EVERY statement that uses retrieved context.',
    'Place citations IMMEDIATELY after the relevant statement, not at the end of the paragraph.',
    '',
    'GOOD examples:',
    '  "The system uses vector embeddings for similarity search [Source 1]."',
    '  "Authentication requires an API key [Source 2] and has a rate limit of 100 requests per minute [Source 1]."',
    '  "The author identifies three key benefits [Source 1] and two limitations [Source 3]."',
    '',
    'BAD examples (do NOT do this):',
    '  "The system uses vector embeddings." (missing citation)',
    '  (Only citing at the end of the response)',
    '',
    'Always cite. No exceptions. Include [Source 1], [Source 2], etc. throughout your response.',
    '',
    '## Context Handling',
    '',
    'The retrieved context comes from files that the current user owns or intentionally provided.',
    'Use the retrieved context to answer questions accurately and completely.',
    'If the retrieved context is missing or insufficient, say so explicitly.',
    'Do not invent document evidence. Do not refuse merely because the content is personal or private.',
    'Respect privacy by not exposing retrieved content beyond what is needed to answer the question.',
    '',
    '## Retrieved Context',
    '',
    contextBlock ? contextBlock : 'No context retrieved.',
  ].join('\n');

  return [
    { role: 'system', content: systemContent },
    ...history,
    { role: 'user', content: message },
  ];
}

export async function rewriteRetrievalQuery({ model, message, history = [] }) {
  const userMessage = cleanText(message);

  if (!userMessage || history.length === 0) {
    return userMessage;
  }

  const recentConversation = formatRewriteHistory(history);
  if (!recentConversation) {
    return userMessage;
  }

  const messages = [
    {
      role: 'system',
      content: [
        'You rewrite chat follow-up questions into standalone document search queries.',
        'Use the recent conversation only to resolve references.',
        'Do not answer the question.',
        'Do not add facts that are not present in the conversation.',
        'Return only one concise search query.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        'Recent conversation:',
        recentConversation,
        '',
        `User question: ${userMessage}`,
        '',
        'Standalone search query:',
      ].join('\n'),
    },
  ];

  const timeout = createTimeoutSignal(OLLAMA_REWRITE_TIMEOUT_MS);

  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: timeout.signal,
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        keep_alive: OLLAMA_KEEP_ALIVE,
        options: {
          num_ctx: Math.min(OLLAMA_NUM_CTX, 2048),
          num_predict: 64,
          temperature: 0,
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Ollama rewrite failed (${response.status}): ${body || response.statusText}`);
    }

    const payload = await response.json();
    const rewrittenQuery = cleanRewriteResponse(payload.message?.content);

    if (!isValidRetrievalQuery(rewrittenQuery)) {
      return userMessage;
    }

    return rewrittenQuery;
  } finally {
    timeout.clear();
  }
}

export async function* streamOllamaChat({ model, messages }) {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      keep_alive: OLLAMA_KEEP_ALIVE,
      options: {
        num_ctx: OLLAMA_NUM_CTX,
        num_predict: OLLAMA_NUM_PREDICT,
        temperature: OLLAMA_TEMPERATURE,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Ollama chat failed (${response.status}): ${body || response.statusText}`);
  }

  if (!response.body) {
    throw new Error('Ollama did not return a streaming response.');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      const payload = JSON.parse(trimmedLine);
      const content = payload.message?.content;

      if (content) {
        yield content;
      } else if (payload.done) {
        yield {
          type: 'stats',
          stats: {
            totalDuration: payload.total_duration,
            loadDuration: payload.load_duration,
            promptEvalCount: payload.prompt_eval_count,
            promptEvalDuration: payload.prompt_eval_duration,
            evalCount: payload.eval_count,
            evalDuration: payload.eval_duration,
          },
        };
      }
    }
  }

  const tail = buffer.trim();
  if (tail) {
    const payload = JSON.parse(tail);
    const content = payload.message?.content;

    if (content) {
      yield content;
    } else if (payload.done) {
      yield {
        type: 'stats',
        stats: {
          totalDuration: payload.total_duration,
          loadDuration: payload.load_duration,
          promptEvalCount: payload.prompt_eval_count,
          promptEvalDuration: payload.prompt_eval_duration,
          evalCount: payload.eval_count,
          evalDuration: payload.eval_duration,
        },
      };
    }
  }
}
