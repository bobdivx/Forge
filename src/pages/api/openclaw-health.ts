import type { APIRoute } from 'astro';
import {
  getOpenClawGatewayBaseUrl,
  getOpenClawToken,
  fetchOpenClawSessionsPayload,
  normalizeOpenClawSessions,
  getOpenClawClientDebugMeta,
} from '../../lib/openclaw-gateway';

/**
 * Santé OpenClaw : URL + token depuis env ou table Config (Astro DB).
 */
function isLoopbackGateway(url: string): boolean {
  try {
    const u = new URL(url);
    const h = u.hostname.toLowerCase();
    return h === 'localhost' || h === '127.0.0.1' || h === '::1';
  } catch {
    return false;
  }
}

export const GET: APIRoute = async () => {
  const [gatewayUrl, token, configMeta] = await Promise.all([
    getOpenClawGatewayBaseUrl(),
    getOpenClawToken(),
    getOpenClawClientDebugMeta(),
  ]);

  const result = await fetchOpenClawSessionsPayload(undefined);
  if (!result.ok) {
    const loopHint = isLoopbackGateway(gatewayUrl)
      ? 'Définissez une URL de gateway accessible depuis le serveur (IP LAN, DNS interne, ou OPENCLAW_GATEWAY_URL).'
      : undefined;
    const tokenHint =
      !token.trim() && (result.status === 401 || String(result.error || '').includes('401'))
        ? 'Le gateway exige un token — renseignez-le dans Paramètres → Connexion OpenClaw.'
        : undefined;
    return new Response(
      JSON.stringify({
        reachable: false,
        gatewayUrl,
        sessionCount: 0,
        runningCount: 0,
        via: result.via,
        reason: !token.trim() ? 'no_token_or_unreachable' : undefined,
        error: result.error || 'Gateway injoignable ou refusé',
        hint: tokenHint || loopHint,
        openclawDebug: { ...configMeta, attempts: result.attempts },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const sessions = normalizeOpenClawSessions(result.data);
  const running = sessions.filter((s: Record<string, unknown>) => {
    const st = String(s?.status || s?.state || '').toLowerCase();
    return (
      st === 'running' ||
      st === 'active' ||
      st === 'connected' ||
      st === 'online'
    );
  }).length;

  return new Response(
    JSON.stringify({
      reachable: true,
      gatewayUrl,
      sessionCount: sessions.length,
      runningCount: running,
      via: result.via,
      openclawDebug: { ...configMeta, attempts: result.attempts, resolvedVia: result.via },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};
