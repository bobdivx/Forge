import type { APIRoute } from 'astro';
import { fetchZimaOSSessionsPayload, normalizeZimaOSSessions } from '../../lib/zimaos-gateway';

export const GET: APIRoute = async () => {
  const result = await fetchZimaOSSessionsPayload(undefined);

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

  const sessions = normalizeZimaOSSessions(result.data) as Array<{
    estimatedCostUsd?: number;
    totalTokens?: number;
    status?: string;
  }>;

  let totalCost = 0;
  let totalTokens = 0;
  let activeSessions = 0;
  let failedSessions = 0;

  sessions.forEach((s) => {
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
