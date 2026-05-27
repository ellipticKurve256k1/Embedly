import { getSupabaseClient } from '../services/supabase.js';

export function extractBearerToken(request) {
  const auth = request.get?.('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(String(auth).trim());
  return match?.[1] ?? null;
}

export async function authContextMiddleware(request, _response, next) {
  const token = extractBearerToken(request);
  if (!token) {
    next();
    return;
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    next();
    return;
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (!error && user?.id) {
      request.userId = user.id;
    }
  } catch {
    // Proceed anonymously on any verification failure.
  }

  next();
}
