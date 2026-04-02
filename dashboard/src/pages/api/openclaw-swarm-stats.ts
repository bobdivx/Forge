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
    return new Response(
      JSON.stringify({
        error: result.error,
        activities: [],
        activeCount: 0,
        idleCount: 0,
        uniqueAgents: 0,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const sessions = normalizeOpenClawSessions(result.data);
  const rows = sessions.map(mapSessionToAgentRow);
  rows.sort((a, b) => b.lastSeenMs - a.lastSeenMs);

  const activeCount = rows.filter((r) => r.status === 'actif').length;
  const idleCount = rows.length - activeCount;
  const uniqueNames = new Set(rows.map((r) => r.name));

  const activities = rows.slice(0, 12).map((r) => ({
    title: `${r.name}`,
    detail:
      r.status === 'actif'
        ? `Modèle ${r.model} — session active.`
        : `Modèle ${r.model} — en veille.`,
    time: r.lastSeen,
    tone: r.status === 'actif' ? 'blue' : 'slate',
  }));

  return new Response(
    JSON.stringify({
      activities,
      activeCount,
      idleCount,
      uniqueAgents: uniqueNames.size,
      totalSessions: rows.length,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};
