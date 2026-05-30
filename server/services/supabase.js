import { createClient } from '@supabase/supabase-js';

let client = null;

function resolveSupabaseConfig() {
  return {
    url: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    key: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY,
  };
}

export function getSupabaseClient() {
  if (client) return client;

  const { url, key } = resolveSupabaseConfig();

  if (!url || !key) return null;

  client = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return client;
}

export function getSupabaseDataClient(accessToken = null) {
  const { url, key } = resolveSupabaseConfig();

  if (!url || !key) return null;

  if (!accessToken) {
    return getSupabaseClient();
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}
