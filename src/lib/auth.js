const API_BASE = 'http://localhost:3001/api';
const SESSION_TOKEN_KEY = 'embeddly_session_token';

function emitAuthChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('embeddly:auth-changed'));
  }
}

async function parseResponse(response) {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || payload.reason || `Request failed with ${response.status}`);
  }

  return payload;
}

export function getSessionToken() {
  try {
    return window.localStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setSessionToken(token) {
  try {
    window.localStorage.setItem(SESSION_TOKEN_KEY, token);
  } catch {
    // Browser storage can be unavailable in restricted modes.
  }

  emitAuthChanged();
}

export function clearSessionToken() {
  try {
    window.localStorage.removeItem(SESSION_TOKEN_KEY);
  } catch {
    // Browser storage can be unavailable in restricted modes.
  }

  emitAuthChanged();
}

export function getAuthHeaders() {
  const token = getSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function getStoredAuthUserId() {
  try {
    return window.localStorage.getItem('embeddly_auth_user_id');
  } catch {
    return null;
  }
}

export function setStoredAuthUserId(userId) {
  try {
    if (userId) {
      window.localStorage.setItem('embeddly_auth_user_id', userId);
    } else {
      window.localStorage.removeItem('embeddly_auth_user_id');
    }
  } catch {
    // Browser storage can be unavailable in restricted modes.
  }
}

export async function startLnurlAuth() {
  const response = await fetch(`${API_BASE}/auth/lnurl`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });

  return parseResponse(response);
}

export async function getAuthStatus(k1) {
  const searchParams = new URLSearchParams();
  if (k1) {
    searchParams.set('k1', k1);
  }

  const queryString = searchParams.toString();
  const response = await fetch(`${API_BASE}/auth/status${queryString ? `?${queryString}` : ''}`, {
    headers: getAuthHeaders(),
  });

  return parseResponse(response);
}

export async function logout() {
  await fetch(`${API_BASE}/auth/logout`, {
    method: 'POST',
    headers: getAuthHeaders(),
  }).catch(() => {});

  clearSessionToken();
  setStoredAuthUserId(null);
}

export function formatUserId(userId) {
  const value = String(userId ?? '').trim();
  if (value.length <= 14) {
    return value || 'Wallet';
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}
