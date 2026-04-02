import type { APIRoute } from 'astro';
import {
  fetchOpenClawJson,
  normalizeOpenClawSessions,
  mapSessionToAgentRow,
} from '../../lib/openclaw-gateway';

export const GET: APIRoute = async ({ locals }) => {
  const email = locals.user?.email;
  const result = await fetchOpenClawJson(email, '/health');

  if (!result.ok) {
    if (result.status === 401) {
      return new Response(JSON.stringify({ error: result.error }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ error: result.error || 'Gateway' }), {
      status: result.status || 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const sessions = normalizeOpenClawSessions(result.data);
  const agents = sessions.map(mapSessionToAgentRow);

  return new Response(JSON.stringify(agents), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
