const AVERAGE_CHARS_PER_TOKEN = 4;

const DEFAULT_CHUNKING_CONFIG = {
  strategy: 'recursive',
  targetTokens: 450,
  maxTokens: 800,
  minTokens: 40,
  overlapTokens: 80,
  maxChunkSize: 3200,
  minChunkSize: 160,
  overlap: 320,
};

function coerceNumber(value, fallback) {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) ? nextValue : fallback;
}

function tokensToCharacters(tokens) {
  return Math.max(1, Math.floor(tokens * AVERAGE_CHARS_PER_TOKEN));
}

function charactersToTokens(characters) {
  return Math.max(1, Math.ceil(characters / AVERAGE_CHARS_PER_TOKEN));
}

export function normalizeConfig(config = {}) {
  const input = config && typeof config === 'object' ? config : {};
  const strategy = ['recursive', 'paragraph', 'fixed'].includes(input.strategy)
    ? input.strategy
    : DEFAULT_CHUNKING_CONFIG.strategy;
  const maxTokens = Math.max(
    100,
    coerceNumber(
      input.maxTokens,
      charactersToTokens(coerceNumber(input.maxChunkSize, DEFAULT_CHUNKING_CONFIG.maxChunkSize)),
    ),
  );
  const targetTokens = Math.min(
    maxTokens,
    Math.max(100, coerceNumber(input.targetTokens, DEFAULT_CHUNKING_CONFIG.targetTokens)),
  );
  const minTokens = Math.min(
    targetTokens,
    Math.max(
      1,
      coerceNumber(
        input.minTokens,
        charactersToTokens(coerceNumber(input.minChunkSize, DEFAULT_CHUNKING_CONFIG.minChunkSize)),
      ),
    ),
  );
  const overlapTokens = Math.min(
    targetTokens - 1,
    Math.max(
      0,
      coerceNumber(
        input.overlapTokens,
        charactersToTokens(coerceNumber(input.overlap, DEFAULT_CHUNKING_CONFIG.overlap)),
      ),
    ),
  );

  return {
    strategy,
    targetTokens,
    maxTokens,
    minTokens,
    overlapTokens,
    maxChunkSize: Math.max(
      100,
      coerceNumber(input.maxChunkSize, tokensToCharacters(maxTokens)),
    ),
    minChunkSize: Math.max(
      1,
      coerceNumber(input.minChunkSize, tokensToCharacters(minTokens)),
    ),
    overlap: Math.max(0, coerceNumber(input.overlap, tokensToCharacters(overlapTokens))),
  };
}

export function normalizeText(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function estimateTokens(content) {
  return Math.max(1, Math.ceil(content.length / AVERAGE_CHARS_PER_TOKEN));
}

function splitByMarkdownSections(text) {
  return normalizeText(text)
    .split(/\n(?=#{1,6}\s+)/g)
    .map((section) => section.trim())
    .filter(Boolean);
}

export function splitByParagraphs(text) {
  return text
    .replace(/\n(?=#{1,6}\s+)/g, '\n\n')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export function splitBySentences(text) {
  const sentences = text.match(/[^.!?]+[.!?]+(?:["')\]]+)?|[^.!?]+$/g) ?? [text];

  return sentences
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function findLastBoundaryBefore(text, maxLength) {
  const safeMaxLength = Math.min(maxLength, text.length);
  const candidates = [
    text.lastIndexOf('\n', safeMaxLength),
    text.lastIndexOf('. ', safeMaxLength),
    text.lastIndexOf('? ', safeMaxLength),
    text.lastIndexOf('! ', safeMaxLength),
    text.lastIndexOf('; ', safeMaxLength),
    text.lastIndexOf(', ', safeMaxLength),
    text.lastIndexOf(' ', safeMaxLength),
  ].filter((index) => index > Math.floor(safeMaxLength * 0.45));

  return candidates.length > 0 ? Math.max(...candidates) + 1 : safeMaxLength;
}

function splitByCharacterWindow(text, maxCharacters, overlapCharacters = 0) {
  const source = normalizeText(text);
  const safeMax = Math.max(1, maxCharacters);
  const safeOverlap = Math.min(Math.max(0, overlapCharacters), safeMax - 1);
  const chunks = [];
  let start = 0;

  while (start < source.length) {
    const maxEnd = Math.min(source.length, start + safeMax);
    const end = maxEnd === source.length
      ? maxEnd
      : start + findLastBoundaryBefore(source.slice(start, maxEnd), safeMax);
    const chunk = source.slice(start, end).trim();

    if (chunk) {
      chunks.push(chunk);
    }

    if (end >= source.length) {
      break;
    }

    start = Math.max(end - safeOverlap, start + 1);
  }

  return chunks;
}

function splitOversizedUnit(text, config) {
  if (estimateTokens(text) <= config.maxTokens) {
    return [text];
  }

  const paragraphs = splitByParagraphs(text);
  const paragraphUnits = paragraphs.length > 1 ? paragraphs : [text];
  const units = [];

  for (const paragraph of paragraphUnits) {
    if (estimateTokens(paragraph) <= config.maxTokens) {
      units.push(paragraph);
      continue;
    }

    const sentences = splitBySentences(paragraph);
    if (sentences.length > 1) {
      for (const sentence of sentences) {
        if (estimateTokens(sentence) <= config.maxTokens) {
          units.push(sentence);
        } else {
          units.push(...splitByCharacterWindow(sentence, tokensToCharacters(config.maxTokens)));
        }
      }
      continue;
    }

    units.push(...splitByCharacterWindow(paragraph, tokensToCharacters(config.maxTokens)));
  }

  return units;
}

function getOverlapFromChunk(chunk, overlapTokens) {
  if (overlapTokens <= 0) {
    return '';
  }

  const overlapCharacters = tokensToCharacters(overlapTokens);
  const start = Math.max(0, chunk.length - overlapCharacters);
  const boundary = chunk.indexOf(' ', start);

  return chunk.slice(boundary > -1 ? boundary + 1 : start).trim();
}

export function mergeSemanticUnits(units, config) {
  const normalizedConfig = typeof config === 'number'
    ? normalizeConfig({ targetTokens: charactersToTokens(config), maxTokens: charactersToTokens(config) })
    : normalizeConfig(config);
  const chunks = [];
  let current = '';

  const flushCurrent = () => {
    const nextChunk = current.trim();

    if (nextChunk) {
      chunks.push(nextChunk);
    }

    current = '';
  };

  for (const unit of units) {
    const candidate = current ? `${current}\n\n${unit}` : unit;

    if (estimateTokens(candidate) <= normalizedConfig.targetTokens) {
      current = candidate;
      continue;
    }

    if (current && estimateTokens(candidate) <= normalizedConfig.maxTokens) {
      current = candidate;
      flushCurrent();
      continue;
    }

    if (current) {
      flushCurrent();
    }

    if (estimateTokens(unit) > normalizedConfig.maxTokens) {
      for (const splitUnit of splitByCharacterWindow(unit, tokensToCharacters(normalizedConfig.maxTokens))) {
        current = splitUnit;
        flushCurrent();
      }
    } else {
      current = unit;
    }
  }

  flushCurrent();

  return chunks;
}

export function compactSmallChunks(chunks, config) {
  const normalizedConfig = typeof config === 'number'
    ? normalizeConfig({ minTokens: charactersToTokens(config), targetTokens: charactersToTokens(config * 2) })
    : normalizeConfig(config);
  const compacted = [];

  for (const chunk of chunks) {
    const previous = compacted.at(-1);

    if (
      previous
      && estimateTokens(chunk) < normalizedConfig.minTokens
      && estimateTokens(`${previous}\n\n${chunk}`) <= normalizedConfig.maxTokens
    ) {
      compacted[compacted.length - 1] = `${previous}\n\n${chunk}`;
      continue;
    }

    compacted.push(chunk);
  }

  return compacted.filter((chunk) => estimateTokens(chunk) >= normalizedConfig.minTokens || compacted.length === 1);
}

function applyChunkOverlap(chunks, config) {
  if (config.overlapTokens <= 0 || chunks.length <= 1) {
    return chunks;
  }

  return chunks.map((chunk, index) => {
    if (index === 0) {
      return chunk;
    }

    const overlap = getOverlapFromChunk(chunks[index - 1], config.overlapTokens);
    const candidate = overlap ? `${overlap}\n\n${chunk}` : chunk;

    return estimateTokens(candidate) <= config.maxTokens
      ? candidate
      : chunk;
  });
}

function chunkByRecursiveStrategy(text, config) {
  const sections = splitByMarkdownSections(text);
  const semanticUnits = sections.flatMap((section) => splitOversizedUnit(section, config));
  const mergedChunks = mergeSemanticUnits(semanticUnits, config);
  const compactedChunks = compactSmallChunks(mergedChunks, config);

  return applyChunkOverlap(compactedChunks, config);
}

function chunkByParagraph(text, config) {
  const paragraphs = splitByParagraphs(text).flatMap((paragraph) => splitOversizedUnit(paragraph, config));
  return compactSmallChunks(paragraphs, config);
}

function chunkByFixedSize(text, maxChunkSize, minChunkSize, overlap) {
  return splitByCharacterWindow(text, maxChunkSize, overlap)
    .filter((chunk) => chunk.length >= minChunkSize);
}

export function chunkText(text, config = {}) {
  const normalizedConfig = normalizeConfig(config);
  let chunks;

  if (normalizedConfig.strategy === 'fixed') {
    chunks = chunkByFixedSize(
      text,
      normalizedConfig.maxChunkSize,
      normalizedConfig.minChunkSize,
      normalizedConfig.overlap,
    );
  } else if (normalizedConfig.strategy === 'paragraph') {
    chunks = chunkByParagraph(text, normalizedConfig);
  } else {
    chunks = chunkByRecursiveStrategy(text, normalizedConfig);
  }

  return chunks.map((content, idx) => ({
    idx,
    content,
    tokenCount: estimateTokens(content),
  }));
}
