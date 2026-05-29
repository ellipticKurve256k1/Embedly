import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY ?? '';

let supabase = null;

function getClient() {
  if (!supabase && SUPABASE_URL && SUPABASE_ANON_KEY) {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabase;
}

export function getSessionToken() {
  const client = getClient();
  if (!client) return null;

  return client.auth.getSession()
    .then(({ data: { session } }) => session?.access_token ?? null)
    .catch(() => null);
}

export function getAuthHeaders() {
  const token = getSessionTokenSync();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function getStoredSessionToken() {
  try {
    return window.localStorage.getItem('embeddly_session_token');
  } catch {
    return null;
  }
}

function getSessionTokenSync() {
  return getStoredSessionToken();
}

export function setSessionToken(token) {
  try {
    if (token) {
      window.localStorage.setItem('embeddly_session_token', token);
    } else {
      window.localStorage.removeItem('embeddly_session_token');
    }
  } catch {
    // Browser storage can be unavailable in restricted modes.
  }
}

export function clearSessionToken() {
  setSessionToken(null);
}

export function emitAuthChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('embeddly:auth-changed'));
  }
}

export async function signInWithEmail(email, password) {
  const client = getClient();
  if (!client) throw new Error('Supabase is not configured.');
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (data?.session) {
    setSessionToken(data.session.access_token);
    emitAuthChanged();
  }
  return data;
}

export async function signInWithMagicLink(email) {
  const client = getClient();
  if (!client) throw new Error('Supabase is not configured.');
  const { error } = await client.auth.signInWithOtp({ email });
  if (error) throw error;
}

export async function signInWithOAuth(provider) {
  const client = getClient();
  if (!client) throw new Error('Supabase is not configured.');
  const { error } = await client.auth.signInWithOAuth({ provider });
  if (error) throw error;
}

export async function signOut() {
  const client = getClient();
  if (client) {
    await client.auth.signOut().catch(() => {});
  }
  clearSessionToken();
  emitAuthChanged();
}

export async function getAuthStatus() {
  const client = getClient();
  if (!client) {
    clearSessionToken();
    return { authenticated: false };
  }

  const { data: { session }, error } = await client.auth.getSession();
  if (error || !session) {
    clearSessionToken();
    return { authenticated: false };
  }

  setSessionToken(session.access_token);

  return {
    authenticated: true,
    userId: session.user.id,
    email: session.user.email,
  };
}

export function initAuthListener(callback) {
  const client = getClient();
  if (!client) return () => {};

  const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
    if (session) {
      setSessionToken(session.access_token);
    } else {
      clearSessionToken();
    }
    emitAuthChanged();
    callback?.();
  });

  return () => subscription?.unsubscribe();
}

export function formatUserId(userId) {
  const value = String(userId ?? '').trim();
  if (value.length <= 14) return value || 'User';

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}
