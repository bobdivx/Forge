import type { APIRoute } from 'astro';
import {
  fetchOpenClawJson,
  normalizeOpenClawSessions,
  mapSessionToAgentRow,
} from '../../lib/openclaw-gateway';

export const POST: APIRoute = async ({ locals }) => {
  const email = locals.user?.email;
  const result = await fetchOpenClawJson(email, '/api/sessions');

  if (!result.ok) {
    return new Response(JSON.stringify({ error: result.error }), {
      status: result.status || 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const sessions = normalizeOpenClawSessions(result.data);
  const rows = sessions.map(mapSessionToAgentRow);

  const toClean = rows.filter((r) => {
    const rawStatus = String(r.raw?.status || '').toLowerCase();
    const ageHours = (Date.now() - r.lastSeenMs) / (1000 * 3600);
    // Clean if failed or very old (7 days) and not active
    return rawStatus === 'failed' || rawStatus === 'error' || (ageHours > 168 && r.status !== 'actif');
  });

  if (toClean.length === 0) {
    return new Response(JSON.stringify({ message: 'Aucune session à nettoyer.', count: 0 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const results = [];
  for (const session of toClean) {
    // Try to terminate the session
    const closeRes = await fetchOpenClawJson(email, '/rpc/call/sessions.terminate', {
      method: 'POST',
      body: JSON.stringify({ sessionKey: session.id }),
      headers: { 'Content-Type': 'application/json' },
    });
    results.push({ id: session.id, ok: closeRes.ok });
  }

  const successCount = results.filter((r) => r.ok).length;

  return new Response(
    JSON.stringify({
      message: `${successCount} sessions nettoyées.`,
      count: successCount,
      total: results.length,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};
