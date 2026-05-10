import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeFilename } from './filename.js';

function mojibake(value) {
  return Buffer.from(value, 'utf8').toString('latin1');
}

test('normalizeFilename preserves ASCII filenames', () => {
  assert.equal(normalizeFilename('document.pdf'), 'document.pdf');
});

test('normalizeFilename preserves valid Unicode filenames', () => {
  assert.equal(normalizeFilename('문서.pdf'), '문서.pdf');
  assert.equal(normalizeFilename('日本語.txt'), '日本語.txt');
  assert.equal(normalizeFilename('🎉party.pdf'), '🎉party.pdf');
});

test('normalizeFilename repairs UTF-8 bytes interpreted as Latin-1', () => {
  assert.equal(normalizeFilename(`${mojibake('문서')}.pdf`), '문서.pdf');
  assert.equal(normalizeFilename(`${mojibake('日本語')}.txt`), '日本語.txt');
  assert.equal(normalizeFilename(`${mojibake('文档')}.csv`), '文档.csv');
});

test('normalizeFilename repairs percent-encoded UTF-8 filenames', () => {
  assert.equal(normalizeFilename('%EB%AC%B8%EC%84%9C.pdf'), '문서.pdf');
  assert.equal(normalizeFilename('%E6%97%A5%E6%9C%AC%E8%AA%9E.txt'), '日本語.txt');
});

test('normalizeFilename applies NFC normalization', () => {
  assert.equal(normalizeFilename('e\u0301tude.txt'), 'étude.txt');
});

test('normalizeFilename sanitizes path separators and control characters', () => {
  assert.equal(normalizeFilename('path/to/file.pdf'), 'path_to_file.pdf');
  assert.equal(normalizeFilename('back\\slash.pdf'), 'back_slash.pdf');
  assert.equal(normalizeFilename('bad\u0000name\u001F.txt'), 'badname.txt');
});

test('normalizeFilename returns a placeholder for empty or invalid filenames', () => {
  assert.match(normalizeFilename(''), /^unnamed-file-\d+$/);
  assert.match(normalizeFilename('\u0000\u001F'), /^unnamed-file-\d+$/);
});

test('normalizeFilename truncates very long filenames while preserving extension', () => {
  const result = normalizeFilename(`${'a'.repeat(300)}.pdf`);
  assert.equal(Array.from(result).length, 255);
  assert.ok(result.endsWith('.pdf'));
});
