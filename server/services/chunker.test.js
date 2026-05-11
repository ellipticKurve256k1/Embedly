import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chunkText,
  compactSmallChunks,
  estimateTokens,
  mergeSemanticUnits,
  normalizeConfig,
  normalizeText,
  splitByParagraphs,
  splitBySentences,
} from './chunker.js';

test('normalizeConfig returns defaults for empty input', () => {
  const result = normalizeConfig({});
  assert.equal(result.strategy, 'recursive');
  assert.equal(result.targetTokens, 450);
  assert.equal(result.maxTokens, 800);
});

test('normalizeConfig rejects unknown strategy', () => {
  assert.equal(normalizeConfig({ strategy: 'unknown' }).strategy, 'recursive');
});

test('normalizeConfig accepts paragraph strategy', () => {
  assert.equal(normalizeConfig({ strategy: 'paragraph' }).strategy, 'paragraph');
});

test('normalizeConfig accepts fixed strategy', () => {
  assert.equal(normalizeConfig({ strategy: 'fixed' }).strategy, 'fixed');
});

test('normalizeConfig coerces invalid numeric values to safe values', () => {
  const result = normalizeConfig({ maxTokens: 'bad', minTokens: -10, overlapTokens: 9999 });
  assert.equal(result.maxTokens, 800);
  assert.equal(result.minTokens, 1);
  assert.ok(result.overlapTokens < result.targetTokens);
});

test('normalizeText collapses whitespace and line endings', () => {
  assert.equal(normalizeText(' A\r\n\r\n\r\nB\t C '), 'A\n\nB C');
});

test('estimateTokens estimates at least one token', () => {
  assert.equal(estimateTokens(''), 1);
  assert.equal(estimateTokens('abcd'), 1);
  assert.equal(estimateTokens('abcde'), 2);
});

test('splitByParagraphs splits blank-line separated text', () => {
  assert.deepEqual(splitByParagraphs('One\n\nTwo\n\n\nThree'), ['One', 'Two', 'Three']);
});

test('splitByParagraphs treats markdown headings as paragraph boundaries', () => {
  assert.deepEqual(splitByParagraphs('Intro\n# Heading\nBody'), ['Intro', '# Heading\nBody']);
});

test('splitBySentences splits basic sentence boundaries', () => {
  assert.deepEqual(splitBySentences('One. Two? Three!'), ['One.', 'Two?', 'Three!']);
});

test('splitBySentences preserves text without punctuation', () => {
  assert.deepEqual(splitBySentences('No punctuation here'), ['No punctuation here']);
});

test('mergeSemanticUnits combines small units', () => {
  const result = mergeSemanticUnits(['Alpha', 'Beta'], { targetTokens: 100, maxTokens: 100 });
  assert.deepEqual(result, ['Alpha\n\nBeta']);
});

test('mergeSemanticUnits splits oversized units', () => {
  const result = mergeSemanticUnits(['word '.repeat(200)], { targetTokens: 10, maxTokens: 20 });
  assert.ok(result.length > 1);
});

test('compactSmallChunks merges small chunks into previous chunk', () => {
  const result = compactSmallChunks(['large enough chunk text', 'tiny'], { minTokens: 3, maxTokens: 100 });
  assert.deepEqual(result, ['large enough chunk text\n\ntiny']);
});

test('chunkText returns indexed chunk objects', () => {
  const result = chunkText('One paragraph.\n\nSecond paragraph.', { strategy: 'paragraph' });
  assert.ok(result.length >= 1);
  assert.equal(result[0].idx, 0);
  assert.equal(typeof result[0].content, 'string');
  assert.equal(typeof result[0].tokenCount, 'number');
});

test('chunkText handles empty input', () => {
  assert.deepEqual(chunkText(''), []);
});

test('chunkText supports fixed strategy', () => {
  const result = chunkText('word '.repeat(200), {
    strategy: 'fixed',
    maxChunkSize: 100,
    minChunkSize: 1,
    overlap: 0,
  });
  assert.ok(result.length > 1);
  assert.ok(result.every((chunk) => chunk.content.length <= 100));
});

test('chunkText applies overlap for recursive chunks when possible', () => {
  const result = chunkText('Alpha '.repeat(120) + '\n\n' + 'Beta '.repeat(120), {
    strategy: 'recursive',
    targetTokens: 30,
    maxTokens: 80,
    minTokens: 1,
    overlapTokens: 5,
  });
  assert.ok(result.length > 1);
});
