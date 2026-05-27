import express from 'express';
import { getSupabaseClient } from '../services/supabase.js';
import { extractBearerToken } from '../middleware/auth.js';

const router = express.Router();

router.get('/status', async (request, response) => {
  const token = extractBearerToken(request);
  if (!token) {
    return response.json({ authenticated: false });
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return response.json({ authenticated: false });
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return response.json({ authenticated: false });
    }

    return response.json({
      authenticated: true,
      userId: user.id,
      email: user.email,
    });
  } catch {
    return response.json({ authenticated: false });
  }
});

router.post('/logout', (_request, response) => {
  response.json({ authenticated: false });
});

export default router;
