import type { APIRoute } from 'astro';
import {
  fetchOpenClawJson,
  normalizeOpenClawSessions,
  mapSessionToAgentRow,
} from '../../lib/openclaw-gateway';

export const GET: APIRoute = async ({ locals }) => {
  const email = locals.user?.email;
  const result = await fetchOpenClawJson(email, '/api/sessions');

  if (!result.ok) {
    return new Response(
      JSON.stringify({
        error: result.error,
        totalCost: 0,
        totalTokens: 0,
        activeSessions: 0,
        failedSessions: 0,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const sessions = normalizeOpenClawSessions(result.data);
  const rows = sessions.map(mapSessionToAgentRow);

  let totalCost = 0;
  let totalTokens = 0;
  let activeSessions = 0;
  let failedSessions = 0;

  for (const r of rows) {
    totalCost += r.estimatedCostUsd || 0;
    totalTokens += r.totalTokens || 0;
    if (r.status === 'actif') activeSessions++;
    
    // Check raw status for failure
    const rawStatus = String(r.raw?.status || '').toLowerCase();
    if (rawStatus === 'failed' || rawStatus === 'error') failedSessions++;
    
    // Consider old sessions as potential candidates for cleanup
    // e.g. more than 24 hours old and not active
    const ageHours = (Date.now() - r.lastSeenMs) / (1000 * 3600);
    if (ageHours > 24 && r.status !== 'actif') {
       // We can track these too
    }
  }

  return new Response(
    JSON.stringify({
      totalCost: Number(totalCost.toFixed(4)),
      totalTokens,
      activeSessions,
      failedSessions,
      currency: 'USD',
      sessionCount: rows.length,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};
