import express from 'express';
import {
  completeAuthChallenge,
  consumeCompletedChallenge,
  createAuthChallenge,
  revokeSession,
  verifySessionToken,
} from '../services/auth.js';
import { extractBearerToken, extractCookieToken } from '../middleware/auth.js';

const router = express.Router();

function getCallbackBaseUrl(request) {
  const forwardedProto = String(request.get('x-forwarded-proto') ?? '').split(',')[0].trim();
  const protocol = forwardedProto || request.protocol || 'http';
  const host = request.get('host');
  return `${protocol}://${host}/api/auth/lnurl/callback`;
}

function lnurlError(response, reason) {
  response.status(400).json({ status: 'ERROR', reason });
}

router.post('/lnurl', (request, response) => {
  response.json(createAuthChallenge(getCallbackBaseUrl(request)));
});

router.get('/lnurl/callback', async (request, response) => {
  try {
    const k1 = String(request.query.k1 ?? '');
    const signature = String(request.query.sig ?? '');
    const publicKey = String(request.query.key ?? '');

    await completeAuthChallenge({ k1, signature, publicKey });
    response.json({ status: 'OK' });
  } catch (error) {
    lnurlError(
      response,
      error instanceof Error ? error.message : 'Authentication failed.',
    );
  }
});

router.get('/status', async (request, response) => {
  const challengeResult = request.query.k1
    ? consumeCompletedChallenge(String(request.query.k1))
    : null;

  if (challengeResult) {
    response.json(challengeResult);
    return;
  }

  const token = extractBearerToken(request) || extractCookieToken(request);

  if (!token) {
    response.json({ authenticated: false });
    return;
  }

  try {
    const session = await verifySessionToken(token);
    response.json({ authenticated: true, userId: session.userId });
  } catch {
    response.json({ authenticated: false });
  }
});

router.post('/logout', (request, response) => {
  revokeSession(request.sessionId);
  response.clearCookie?.('embeddly_session');
  response.json({ authenticated: false });
});

export default router;
