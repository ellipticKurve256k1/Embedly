import { readFile } from 'node:fs/promises';
import { parse } from 'csv-parse/sync';
import { PDFParse } from 'pdf-parse';

const LEGACY_TEXT_ENCODINGS = [
  'euc-kr',
  'shift_jis',
  'gb18030',
  'big5',
  'windows-1252',
];

function getExtension(filename) {
  return filename.split('.').pop()?.toLowerCase() ?? '';
}

function decodeWithEncoding(buffer, encoding, options = {}) {
  const decoder = new TextDecoder(encoding, options);
  return decoder.decode(buffer);
}

function decodeUtf8Strict(buffer) {
  return decodeWithEncoding(buffer, 'utf-8', { fatal: true });
}

function detectBomEncoding(buffer) {
  if (buffer.length >= 3
    && buffer[0] === 0xef
    && buffer[1] === 0xbb
    && buffer[2] === 0xbf) {
    return 'utf-8';
  }

  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return 'utf-16le';
  }

  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return 'utf-16be';
  }

  return null;
}

function detectUtf16ByNullPattern(buffer) {
  const sampleLength = Math.min(buffer.length, 512);
  if (sampleLength < 8) return null;

  let evenNulls = 0;
  let oddNulls = 0;

  for (let index = 0; index < sampleLength; index += 1) {
    if (buffer[index] !== 0) continue;

    if (index % 2 === 0) {
      evenNulls += 1;
    } else {
      oddNulls += 1;
    }
  }

  const pairCount = Math.floor(sampleLength / 2);
  if (oddNulls / pairCount > 0.35 && evenNulls / pairCount < 0.08) {
    return 'utf-16le';
  }

  if (evenNulls / pairCount > 0.35 && oddNulls / pairCount < 0.08) {
    return 'utf-16be';
  }

  return null;
}

function countMatches(text, pattern) {
  return text.match(pattern)?.length ?? 0;
}

function scoreDecodedText(text) {
  if (!text) return Number.POSITIVE_INFINITY;

  const length = text.length;
  const replacementCount = countMatches(text, /\uFFFD/g);
  const nullCount = countMatches(text, /\0/g);
  const controlCount = countMatches(text, /[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g);
  const readableCount = countMatches(text, /[\p{L}\p{N}\p{P}\p{S}\s]/gu);
  const cjkCount = countMatches(text, /[\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/gu);
  const readableRatio = readableCount / length;

  return (
    replacementCount * 120
    + nullCount * 80
    + controlCount * 30
    + (1 - readableRatio) * 40
    - Math.min(cjkCount, 200) * 0.04
  );
}

function decodeLegacyText(buffer) {
  const candidates = LEGACY_TEXT_ENCODINGS
    .map((encoding) => {
      try {
        const text = decodeWithEncoding(buffer, encoding);
        return { encoding, text, score: scoreDecodedText(text) };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((first, second) => first.score - second.score);

  if (candidates.length === 0 || !Number.isFinite(candidates[0].score)) {
    throw new Error('Unable to decode document text with supported character encodings.');
  }

  return candidates[0].text;
}

function decodeTextBuffer(buffer) {
  const bomEncoding = detectBomEncoding(buffer);
  if (bomEncoding) {
    return decodeWithEncoding(buffer, bomEncoding).normalize('NFC');
  }

  const utf16Encoding = detectUtf16ByNullPattern(buffer);
  if (utf16Encoding) {
    return decodeWithEncoding(buffer, utf16Encoding).normalize('NFC');
  }

  try {
    return decodeUtf8Strict(buffer).normalize('NFC');
  } catch {
    return decodeLegacyText(buffer).normalize('NFC');
  }
}

async function parsePdf(filePath) {
  const buffer = await readFile(filePath);
  const parser = new PDFParse({ data: buffer });

  try {
    const result = await parser.getText();
    return result.text ?? '';
  } finally {
    await parser.destroy();
  }
}

async function parseCsv(filePath) {
  const content = decodeTextBuffer(await readFile(filePath));
  const rows = parse(content, {
    relaxColumnCount: true,
    skipEmptyLines: true,
    trim: true,
  });

  return rows
    .map((row) => row.filter(Boolean).join(' '))
    .filter(Boolean)
    .join('\n');
}

export async function parseFile({ filePath, filename, mimeType }) {
  const extension = getExtension(filename);

  if (mimeType === 'application/pdf' || extension === 'pdf') {
    return parsePdf(filePath);
  }

  if (mimeType === 'text/csv' || extension === 'csv') {
    return parseCsv(filePath);
  }

  if (
    mimeType?.startsWith('text/')
    || extension === 'txt'
    || extension === 'md'
    || extension === 'markdown'
  ) {
    return decodeTextBuffer(await readFile(filePath));
  }

  throw new Error(`Unsupported file type: ${mimeType || extension || 'unknown'}`);
}
