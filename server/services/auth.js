import crypto from 'node:crypto';
import { bech32 } from 'bech32';
import { SignJWT, jwtVerify } from 'jose';
import * as secp256k1 from '@noble/secp256k1';
import {
  createCredentialSession,
  deleteCredentialSession,
  deleteExpiredCredentialSessions,
  ensureCredentialUser,
  getCredentialSession,
} from '../db/credentials.js';
import { resolveEncryptionKey } from './settings.js';

const AUTH_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_SECONDS = 24 * 60 * 60;
const LNURL_BECH32_LIMIT = 2000;
const pendingChallenges = new Map();

function nowMs() {
  return Date.now();
}

function isHex(value, length) {
  return typeof value === 'string'
    && value.length === length
    && /^[0-9a-f]+$/i.test(value);
}

function normalizeHex(value) {
  return String(value ?? '').trim().toLowerCase();
}

function bytesToBigInt(bytes) {
  const hex = Buffer.from(bytes).toString('hex').replace(/^0+/, '') || '0';
  return BigInt(`0x${hex}`);
}

function readDerLength(bytes, offset) {
  if (offset >= bytes.length) {
    return null;
  }

  const firstByte = bytes[offset];

  if (firstByte < 0x80) {
    return { length: firstByte, nextOffset: offset + 1 };
  }

  const lengthByteCount = firstByte & 0x7f;
  if (lengthByteCount === 0 || lengthByteCount > 2 || offset + 1 + lengthByteCount > bytes.length) {
    return null;
  }

  let length = 0;
  for (let index = 0; index < lengthByteCount; index += 1) {
    length = (length << 8) + bytes[offset + 1 + index];
  }

  return { length, nextOffset: offset + 1 + lengthByteCount };
}

export function parseDerSignature(signatureHex) {
  const normalizedSignature = normalizeHex(signatureHex);

  if (!/^[0-9a-f]+$/i.test(normalizedSignature) || normalizedSignature.length % 2 !== 0) {
    return null;
  }

  const bytes = Buffer.from(normalizedSignature, 'hex');
  let offset = 0;

  if (bytes[offset] !== 0x30) {
    return null;
  }
  offset += 1;

  const sequenceLength = readDerLength(bytes, offset);
  if (!sequenceLength || sequenceLength.nextOffset + sequenceLength.length !== bytes.length) {
    return null;
  }
  offset = sequenceLength.nextOffset;

  if (bytes[offset] !== 0x02) {
    return null;
  }
  offset += 1;

  const rLength = readDerLength(bytes, offset);
  if (!rLength || rLength.length === 0 || rLength.nextOffset + rLength.length > bytes.length) {
    return null;
  }
  offset = rLength.nextOffset;
  const rBytes = bytes.subarray(offset, offset + rLength.length);
  offset += rLength.length;

  if (bytes[offset] !== 0x02) {
    return null;
  }
  offset += 1;

  const sLength = readDerLength(bytes, offset);
  if (!sLength || sLength.length === 0 || sLength.nextOffset + sLength.length !== bytes.length) {
    return null;
  }
  offset = sLength.nextOffset;
  const sBytes = bytes.subarray(offset, offset + sLength.length);

  return {
    r: bytesToBigInt(rBytes),
    s: bytesToBigInt(sBytes),
  };
}

function pruneExpiredChallenges() {
  const currentTime = nowMs();

  for (const [k1, challenge] of pendingChallenges.entries()) {
    if (challenge.expiresAt <= currentTime) {
      pendingChallenges.delete(k1);
    }
  }
}

function getJwtSecret() {
  return new Uint8Array(resolveEncryptionKey());
}

export function encodeLnurl(callbackUrl) {
  const words = bech32.toWords(Buffer.from(callbackUrl, 'utf8'));
  return bech32.encode('lnurl', words, LNURL_BECH32_LIMIT);
}

export function createAuthChallenge(callbackBaseUrl) {
  pruneExpiredChallenges();

  const k1 = crypto.randomBytes(32).toString('hex');
  const callbackUrl = new URL(callbackBaseUrl);
  callbackUrl.searchParams.set('tag', 'login');
  callbackUrl.searchParams.set('k1', k1);
  callbackUrl.searchParams.set('action', 'login');

  pendingChallenges.set(k1, {
    k1,
    status: 'pending',
    expiresAt: nowMs() + AUTH_CHALLENGE_TTL_MS,
    token: null,
    userId: null,
  });

  return {
    k1,
    lnurl: encodeLnurl(callbackUrl.toString()),
    expiresAt: new Date(nowMs() + AUTH_CHALLENGE_TTL_MS).toISOString(),
  };
}

export function verifyLnurlAuth(k1, signature, publicKey) {
  const normalizedK1 = normalizeHex(k1);
  const normalizedSignature = normalizeHex(signature);
  const normalizedPublicKey = normalizeHex(publicKey);

  if (!isHex(normalizedK1, 64)) {
    return false;
  }

  if (!/^[0-9a-f]+$/i.test(normalizedSignature) || normalizedSignature.length < 16) {
    return false;
  }

  if (!(
    isHex(normalizedPublicKey, 66)
    || isHex(normalizedPublicKey, 130)
  )) {
    return false;
  }

  try {
    const k1Bytes = Buffer.from(normalizedK1, 'hex');
    const parsedSignature = parseDerSignature(normalizedSignature);
    const signatureForVerify = parsedSignature
      ?? (normalizedSignature.length === 128 ? normalizedSignature : null);

    if (!signatureForVerify) {
      return false;
    }

    const messageHash = crypto
      .createHash('sha256')
      .update(k1Bytes)
      .digest();

    return (
      secp256k1.verify(signatureForVerify, k1Bytes, normalizedPublicKey, { lowS: false })
      || secp256k1.verify(signatureForVerify, messageHash, normalizedPublicKey, { lowS: false })
    );
  } catch {
    return false;
  }
}

export function ensureUser(publicKey) {
  const normalizedPublicKey = normalizeHex(publicKey);

  if (!(
    isHex(normalizedPublicKey, 66)
    || isHex(normalizedPublicKey, 130)
  )) {
    throw new Error('Valid linking public key is required.');
  }

  return ensureCredentialUser(normalizedPublicKey);
}

export async function createSessionToken(userId) {
  deleteExpiredCredentialSessions();

  const sessionId = crypto.randomUUID();
  const expiresAtDate = new Date(nowMs() + SESSION_TTL_SECONDS * 1000);
  const expiresAt = expiresAtDate.toISOString();

  createCredentialSession({ sessionId, userId, expiresAt });

  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setJti(sessionId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getJwtSecret());

  return { token, userId, sessionId, expiresAt };
}

export async function verifySessionToken(token) {
  const { payload } = await jwtVerify(String(token ?? ''), getJwtSecret(), {
    algorithms: ['HS256'],
  });
  const userId = typeof payload.sub === 'string' ? payload.sub : '';
  const sessionId = typeof payload.jti === 'string' ? payload.jti : '';

  if (!userId || !sessionId) {
    throw new Error('Invalid session token.');
  }

  const session = getCredentialSession(sessionId);

  if (!session || session.user_id !== userId || new Date(session.expires_at).getTime() <= nowMs()) {
    throw new Error('Session has expired.');
  }

  return { userId, sessionId };
}

export function getPendingChallenge(k1) {
  pruneExpiredChallenges();
  return pendingChallenges.get(normalizeHex(k1)) ?? null;
}

export async function completeAuthChallenge({ k1, signature, publicKey }) {
  pruneExpiredChallenges();

  const normalizedK1 = normalizeHex(k1);
  const challenge = pendingChallenges.get(normalizedK1);

  if (!challenge) {
    throw new Error('Expired authentication request.');
  }

  if (challenge.status !== 'pending') {
    throw new Error('Authentication request already used.');
  }

  if (!verifyLnurlAuth(normalizedK1, signature, publicKey)) {
    throw new Error('Invalid wallet signature.');
  }

  const userId = ensureUser(publicKey);
  const session = await createSessionToken(userId);

  pendingChallenges.set(normalizedK1, {
    ...challenge,
    status: 'completed',
    userId,
    token: session.token,
    sessionId: session.sessionId,
    expiresAt: nowMs() + AUTH_CHALLENGE_TTL_MS,
  });

  return session;
}

export function consumeCompletedChallenge(k1) {
  const challenge = getPendingChallenge(k1);

  if (!challenge || challenge.status !== 'completed') {
    return null;
  }

  pendingChallenges.delete(challenge.k1);
  return {
    authenticated: true,
    userId: challenge.userId,
    token: challenge.token,
  };
}

export function revokeSession(sessionId) {
  if (sessionId) {
    deleteCredentialSession(sessionId);
  }
}
