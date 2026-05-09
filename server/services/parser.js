import { readFile } from 'node:fs/promises';
import { parse } from 'csv-parse/sync';
import { PDFParse } from 'pdf-parse';

function getExtension(filename) {
  return filename.split('.').pop()?.toLowerCase() ?? '';
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
  const content = await readFile(filePath, 'utf8');
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
    return readFile(filePath, 'utf8');
  }

  throw new Error(`Unsupported file type: ${mimeType || extension || 'unknown'}`);
}
