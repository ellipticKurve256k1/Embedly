const MAX_FILENAME_LENGTH = 255;

const MOJIBAKE_MARKERS = /[ÂÃÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ]/g;
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F]/g;
const PATH_SEPARATORS = /[\\/]/g;
const PERCENT_BYTE = /%[0-9a-fA-F]{2}/;

function decodeLatin1AsUtf8(value) {
  const bytes = new Uint8Array(value.length);

  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.charCodeAt(index);
    if (codePoint > 0xff) return null;
    bytes[index] = codePoint;
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function decodePercentEncodedUtf8(value) {
  if (!PERCENT_BYTE.test(value)) return null;

  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function countMatches(value, pattern) {
  return value.match(pattern)?.length ?? 0;
}

function scoreFilename(value) {
  if (!value) return Number.POSITIVE_INFINITY;

  const length = value.length;
  const replacementCount = countMatches(value, /\uFFFD/g);
  const controlCount = countMatches(value, CONTROL_CHARACTERS);
  const percentCount = countMatches(value, /%[0-9a-fA-F]{2}/g);
  const mojibakeCount = countMatches(value, MOJIBAKE_MARKERS);
  const cjkCount = countMatches(value, /[\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/gu);
  const readableCount = countMatches(value, /[\p{L}\p{N}\p{P}\p{S}\s]/gu);
  const readableRatio = readableCount / length;

  return (
    replacementCount * 160
    + controlCount * 120
    + percentCount * 10
    + mojibakeCount * 8
    + (1 - readableRatio) * 50
    - Math.min(cjkCount, 80) * 0.35
  );
}

function uniqueCandidates(candidates) {
  return [...new Set(candidates.filter((candidate) => (
    typeof candidate === 'string' && candidate.length > 0
  )))];
}

function repairFilenameEncoding(value) {
  const percentDecoded = decodePercentEncodedUtf8(value);
  const latin1Repaired = decodeLatin1AsUtf8(value);
  const latin1AfterPercent = percentDecoded ? decodeLatin1AsUtf8(percentDecoded) : null;
  const candidates = uniqueCandidates([
    value,
    percentDecoded,
    latin1Repaired,
    latin1AfterPercent,
  ]);

  return candidates
    .map((candidate) => ({ value: candidate, score: scoreFilename(candidate) }))
    .sort((first, second) => first.score - second.score)[0]?.value ?? value;
}

function truncateFilename(value) {
  const characters = Array.from(value);
  if (characters.length <= MAX_FILENAME_LENGTH) return value;

  const dotIndex = value.lastIndexOf('.');
  const extension = dotIndex > 0 ? value.slice(dotIndex) : '';
  const extensionCharacters = Array.from(extension);

  if (extensionCharacters.length > 32 || extensionCharacters.length === 0) {
    return characters.slice(0, MAX_FILENAME_LENGTH).join('');
  }

  const basenameLength = MAX_FILENAME_LENGTH - extensionCharacters.length;
  return `${characters.slice(0, basenameLength).join('')}${extension}`;
}

function fallbackFilename() {
  return `unnamed-file-${Date.now()}`;
}

function sanitizeFilename(value) {
  const sanitized = value
    .normalize('NFC')
    .replace(CONTROL_CHARACTERS, '')
    .replace(PATH_SEPARATORS, '_')
    .replace(/^[\s.]+|[\s.]+$/g, '');

  if (!sanitized || /^[\uFFFD\s._-]+$/.test(sanitized)) {
    return fallbackFilename();
  }

  return truncateFilename(sanitized);
}

export function normalizeFilename(originalname) {
  const rawFilename = typeof originalname === 'string' ? originalname : '';
  const repairedFilename = repairFilenameEncoding(rawFilename);
  return sanitizeFilename(repairedFilename);
}
