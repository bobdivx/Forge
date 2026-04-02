import type { APIRoute } from 'astro';
import {
  fetchOpenClawJson,
  normalizeOpenClawSessions,
  getOpenClawGatewayBaseUrl,
} from '../../lib/openclaw-gateway';

export const GET: APIRoute = async ({ locals }) => {
  const email = locals.user?.email;
  const base = getOpenClawGatewayBaseUrl(email);
  const result = await fetchOpenClawJson(email, '/rpc/call/sessions.list');

  if (!result.ok) {
    return new Response(
      JSON.stringify({
        reachable: false,
        gatewayUrl: base,
        sessionCount: 0,
        runningCount: 0,
        error: result.error,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const sessions = normalizeOpenClawSessions(result.data);
  const running = sessions.filter((s: any) => {
    const st = String(s?.status || '').toLowerCase();
    return st === 'running' || st === 'active';
  }).length;

  return new Response(
    JSON.stringify({
      reachable: true,
      gatewayUrl: base,
      sessionCount: sessions.length,
      runningCount: running,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};
