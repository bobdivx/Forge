import type { APIRoute } from 'astro';
import {
  getOpenClawGatewayBaseUrl,
  getOpenClawToken,
  fetchOpenClawJson,
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
  let gatewayUrl = 'unconfigured';
  try {
    gatewayUrl = await getOpenClawGatewayBaseUrl();
    const configMeta = await getOpenClawClientDebugMeta();
    const health = await fetchOpenClawJson(undefined, '/health');
    if (!health.ok) {
      return new Response(
        JSON.stringify({
          reachable: false,
          gatewayUrl,
          sessionCount: 0,
          error: health.error || 'Gateway injoignable',
          openclawDebug: { ...configMeta, attempts: [{ via: '/health', ok: false, status: health.status, parsedCount: 0 }] },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const result = await fetchOpenClawSessionsPayload(undefined, {
      invokeOnly: true,
      sessionsListArgs: { limit: 40, messageLimit: 0 },
    });
    if (!result.ok) {
        return new Response(
            JSON.stringify({
                reachable: false,
                gatewayUrl,
                sessionCount: 0,
                error: result.error || 'Gateway injected error',
                openclawDebug: { ...configMeta, attempts: result.attempts },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
    }

    const sessions = normalizeOpenClawSessions(result.data);
    const isActuallyReachable = result.via !== '/health';
    return new Response(
        JSON.stringify({
            reachable: isActuallyReachable,
            gatewayUrl,
            sessionCount: sessions.length,
            via: result.via,
            hint: !isActuallyReachable
              ? 'Gateway joignable (/health) mais API sessions inaccessible. Vérifiez OPENCLAW_GATEWAY_URL, token et endpoints /tools/invoke.'
              : undefined,
            openclawDebug: { ...configMeta, attempts: result.attempts, resolvedVia: result.via },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ reachable: false, gatewayUrl, error: e.message }), { status: 200 });
  }
};
