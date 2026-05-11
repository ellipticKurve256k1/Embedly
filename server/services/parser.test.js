import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  decodeTextBuffer,
  detectBomEncoding,
  detectUtf16ByNullPattern,
  parseFile,
  scoreDecodedText,
} from './parser.js';

let tempDir;

before(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'embeddly-parser-'));
});

after(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

test('detectBomEncoding detects UTF-8 BOM', () => {
  assert.equal(detectBomEncoding(Buffer.from([0xef, 0xbb, 0xbf, 65])), 'utf-8');
});

test('detectBomEncoding detects UTF-16LE BOM', () => {
  assert.equal(detectBomEncoding(Buffer.from([0xff, 0xfe, 65, 0])), 'utf-16le');
});

test('detectBomEncoding detects UTF-16BE BOM', () => {
  assert.equal(detectBomEncoding(Buffer.from([0xfe, 0xff, 0, 65])), 'utf-16be');
});

test('detectBomEncoding returns null without BOM', () => {
  assert.equal(detectBomEncoding(Buffer.from('plain')), null);
});

test('detectUtf16ByNullPattern detects UTF-16LE text', () => {
  const buffer = Buffer.from('Hello world', 'utf16le');
  assert.equal(detectUtf16ByNullPattern(buffer), 'utf-16le');
});

test('decodeTextBuffer decodes UTF-8 text', () => {
  assert.equal(decodeTextBuffer(Buffer.from('안녕하세요 Embeddly')), '안녕하세요 Embeddly');
});

test('decodeTextBuffer decodes UTF-16LE text with BOM', () => {
  const body = Buffer.from('Hello', 'utf16le');
  assert.equal(decodeTextBuffer(Buffer.concat([Buffer.from([0xff, 0xfe]), body])), 'Hello');
});

test('scoreDecodedText penalizes replacement characters', () => {
  assert.ok(scoreDecodedText('abc\uFFFD') > scoreDecodedText('abc'));
});

test('parseFile parses text files', async () => {
  const filePath = path.join(tempDir, 'notes.txt');
  await writeFile(filePath, 'Hello text');
  assert.equal(await parseFile({ filePath, filename: 'notes.txt', mimeType: 'text/plain' }), 'Hello text');
});

test('parseFile parses markdown files by extension', async () => {
  const filePath = path.join(tempDir, 'notes.md');
  await writeFile(filePath, '# Title');
  assert.equal(await parseFile({ filePath, filename: 'notes.md', mimeType: '' }), '# Title');
});

test('parseFile parses CSV files into readable text', async () => {
  const filePath = path.join(tempDir, 'data.csv');
  await writeFile(filePath, 'name,value\nAlpha,1\nBeta,2\n');
  const parsed = await parseFile({ filePath, filename: 'data.csv', mimeType: 'text/csv' });
  assert.match(parsed, /name value/);
  assert.match(parsed, /Alpha 1/);
});

test('parseFile rejects unsupported file types', async () => {
  await assert.rejects(
    () => parseFile({ filePath: path.join(tempDir, 'x.bin'), filename: 'x.bin', mimeType: 'application/octet-stream' }),
    /Unsupported file type/,
  );
});
