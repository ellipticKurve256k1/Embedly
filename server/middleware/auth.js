import { verifySessionToken } from '../services/auth.js';

export function extractBearerToken(request) {
  const authorization = request.get?.('authorization') ?? request.headers?.authorization ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(String(authorization).trim());
  return match?.[1] ?? null;
}

export function extractCookieToken(request) {
  const cookieHeader = request.get?.('cookie') ?? request.headers?.cookie ?? '';
  const cookies = String(cookieHeader)
    .split(';')
    .map((cookie) => cookie.trim())
    .filter(Boolean);

  for (const cookie of cookies) {
    const [name, ...valueParts] = cookie.split('=');
    if (name === 'embeddly_session') {
      return decodeURIComponent(valueParts.join('='));
    }
  }

  return null;
}

export async function authContextMiddleware(request, _response, next) {
  const token = extractBearerToken(request) || extractCookieToken(request);

  if (!token) {
    next();
    return;
  }

  try {
    const session = await verifySessionToken(token);
    request.userId = session.userId;
    request.sessionId = session.sessionId;
  } catch {
    request.userId = undefined;
    request.sessionId = undefined;
  }

  next();
}
