import type { APIRoute } from 'astro';
import {
  getOpenClawGatewayBaseUrl,
  getOpenClawToken,
  fetchOpenClawSessionsPayload,
  normalizeOpenClawSessions,
} from '../../lib/openclaw-gateway';

/**
 * Même source que Paramètres → OpenClaw (URL + token en DB / env / legacy config.json).
 * Ne plus utiliser la CLI `openclaw ... --token casaos` : elle masquait les erreurs de config UI.
 */
export const GET: APIRoute = async () => {
  const gatewayUrl = await getOpenClawGatewayBaseUrl();
  const token = await getOpenClawToken();

  if (!token) {
    return new Response(
      JSON.stringify({
        reachable: false,
        gatewayUrl,
        sessionCount: 0,
        runningCount: 0,
        reason: 'no_token',
        error: 'Token OpenClaw absent — renseignez-le dans Paramètres.',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const result = await fetchOpenClawSessionsPayload(undefined);
  if (!result.ok) {
    return new Response(
      JSON.stringify({
        reachable: false,
        gatewayUrl,
        sessionCount: 0,
        runningCount: 0,
        via: result.via,
        error: result.error || 'Gateway injoignable ou refusé',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const sessions = normalizeOpenClawSessions(result.data);
  const running = sessions.filter((s: { status?: string }) => {
    const st = String(s?.status || '').toLowerCase();
    return st === 'running' || st === 'active';
  }).length;

  return new Response(
    JSON.stringify({
      reachable: true,
      gatewayUrl,
      sessionCount: sessions.length,
      runningCount: running,
      via: result.via,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};
