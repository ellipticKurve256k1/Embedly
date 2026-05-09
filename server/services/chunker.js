const DEFAULT_CHUNKING_CONFIG = {
  strategy: 'paragraph',
  maxChunkSize: 1000,
  minChunkSize: 50,
  overlap: 100,
};

function normalizeConfig(config = {}) {
  return {
    strategy: config.strategy === 'fixed' ? 'fixed' : 'paragraph',
    maxChunkSize: Number.isFinite(config.maxChunkSize) ? config.maxChunkSize : DEFAULT_CHUNKING_CONFIG.maxChunkSize,
    minChunkSize: Number.isFinite(config.minChunkSize) ? config.minChunkSize : DEFAULT_CHUNKING_CONFIG.minChunkSize,
    overlap: Number.isFinite(config.overlap) ? config.overlap : DEFAULT_CHUNKING_CONFIG.overlap,
  };
}

function normalizeText(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
}

function estimateTokens(content) {
  return Math.max(1, Math.ceil(content.length / 4));
}

function chunkByParagraph(text, minChunkSize) {
  const prepared = normalizeText(text).replace(/\n(?=#{1,6}\s+)/g, '\n\n');

  return prepared
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length >= minChunkSize);
}

function chunkByFixedSize(text, maxChunkSize, minChunkSize, overlap) {
  const source = normalizeText(text);
  const safeMax = Math.max(1, maxChunkSize);
  const safeOverlap = Math.min(Math.max(0, overlap), safeMax - 1);
  const step = safeMax - safeOverlap;
  const chunks = [];

  for (let start = 0; start < source.length; start += step) {
    const chunk = source.slice(start, start + safeMax).trim();

    if (chunk.length >= minChunkSize) {
      chunks.push(chunk);
    }

    if (start + safeMax >= source.length) {
      break;
    }
  }

  return chunks;
}

export function chunkText(text, config = {}) {
  const { strategy, maxChunkSize, minChunkSize, overlap } = normalizeConfig(config);
  const chunks = strategy === 'fixed'
    ? chunkByFixedSize(text, maxChunkSize, minChunkSize, overlap)
    : chunkByParagraph(text, minChunkSize);

  return chunks.map((content, idx) => ({
    idx,
    content,
    tokenCount: estimateTokens(content),
  }));
}
