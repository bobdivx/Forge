import type { APIRoute } from 'astro';
import { fetchOpenClawSessionsPayload, normalizeOpenClawSessions } from '../../lib/openclaw-gateway';

export const GET: APIRoute = async () => {
  const result = await fetchOpenClawSessionsPayload(undefined);

  if (!result.ok) {
    return new Response(
      JSON.stringify({
        error: result.error,
        totalCost: 0,
        totalTokens: 0,
        activeSessions: 0,
        failedSessions: 0,
        ok: false,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const sessions = normalizeOpenClawSessions(result.data);

  let totalCost = 0;
  let totalTokens = 0;
  let activeSessions = 0;
  let failedSessions = 0;

  sessions.forEach((s: { estimatedCostUsd?: number; totalTokens?: number; status?: string }) => {
    totalCost += s.estimatedCostUsd || 0;
    totalTokens += s.totalTokens || 0;
    const status = String(s.status || '').toLowerCase();
    if (status === 'running' || status === 'active') activeSessions++;
    if (status === 'failed' || status === 'error') failedSessions++;
  });

  return new Response(
    JSON.stringify({
      totalCost,
      totalTokens,
      activeSessions,
      failedSessions,
      ok: true,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
};
