import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDerSignature, verifyLnurlAuth } from './auth.js';

const LUD04_K1 = 'e2af6254a8df433264fa23f67eb8188635d15ce883e8fc020989d5f82ae6f11e';
const LUD04_KEY = '02c3b844b8104f0c1b15c507774c9ba7fc609f58f343b9b149122e944dd20c9362';
const LUD04_SIG = '304402203767faf494f110b139293d9bab3c50e07b3bf33c463d4aa767256cd09132dc5102205821f8efacdb5c595b92ada255876d9201e126e2f31a140d44561cc1f7e9e43d';

test('parseDerSignature parses DER-encoded LNURL auth signatures', () => {
  const signature = parseDerSignature(LUD04_SIG);

  assert.equal(
    signature.r.toString(16),
    '3767faf494f110b139293d9bab3c50e07b3bf33c463d4aa767256cd09132dc51',
  );
  assert.equal(
    signature.s.toString(16),
    '5821f8efacdb5c595b92ada255876d9201e126e2f31a140d44561cc1f7e9e43d',
  );
});

test('verifyLnurlAuth accepts the official LUD-04 signature example', () => {
  assert.equal(verifyLnurlAuth(LUD04_K1, LUD04_SIG, LUD04_KEY), true);
});

test('verifyLnurlAuth rejects altered challenge data', () => {
  const alteredK1 = `0${LUD04_K1.slice(1)}`;

  assert.equal(verifyLnurlAuth(alteredK1, LUD04_SIG, LUD04_KEY), false);
});

test('verifyLnurlAuth rejects altered signatures', () => {
  const alteredSig = `${LUD04_SIG.slice(0, -1)}0`;

  assert.equal(verifyLnurlAuth(LUD04_K1, alteredSig, LUD04_KEY), false);
});

test('verifyLnurlAuth rejects malformed DER without throwing', () => {
  assert.equal(verifyLnurlAuth(LUD04_K1, '3006020101020101', LUD04_KEY), false);
});
