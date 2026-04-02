import type { APIRoute } from 'astro';
import {
  fetchOpenClawJson,
  normalizeOpenClawSessions,
  mapSessionToAgentRow,
} from '../../lib/openclaw-gateway';

/** Journal d'orchestration = vue tabulaire des sessions OpenClaw (état réel). */
export const GET: APIRoute = async ({ locals }) => {
  const email = locals.user?.email;
  const result = await fetchOpenClawJson(email, '/health');

  if (!result.ok) {
    return new Response(
      JSON.stringify({ error: result.error, orders: [] }),
      {
        status: result.status === 401 ? 401 : 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  const sessions = normalizeOpenClawSessions(result.data);
  const rows = sessions.map(mapSessionToAgentRow);
  rows.sort((a, b) => b.lastSeenMs - a.lastSeenMs);

  const orders = rows.map((r, i) => ({
    id: `#SES-${String(rows.length - i).padStart(3, '0')}`,
    date: r.lastSeen,
    agent: r.name,
    target: r.model !== '—' ? r.model : '—',
    task: `Session ${r.id.slice(0, 36)}`,
    status: r.status === 'actif' ? 'En cours' : 'Veille',
  }));

  return new Response(JSON.stringify({ orders }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
