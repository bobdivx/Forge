import type { APIRoute } from 'astro';
import { getConfig } from '../../lib/config-db';
import { getZimaOSInfraClient } from '../../lib/zimaos-infra-client';
import {
  getZimaOSGatewayBaseUrl,
  fetchZimaOSJson,
  fetchZimaOSSessionsPayload,
  normalizeZimaOSSessions,
  getZimaOSClientDebugMeta,
} from '../../lib/zimaos-gateway';

export const GET: APIRoute = async () => {
  let gatewayUrl = 'unconfigured';
  try {
    const accessMode = (await getConfig('zimaosAccessMode')).trim() || 'local_docker';
    gatewayUrl = await getZimaOSGatewayBaseUrl();
    const configMeta = await getZimaOSClientDebugMeta();
    const health = await fetchZimaOSJson(undefined, '/health');
    if (!health.ok) {
      // En mode SSH distant, le header doit rester "OK" si le tunnel SSH est valide,
      // même si l'URL runtime/gateway est momentanément en timeout.
      if (accessMode === 'remote_ssh') {
        const infra = await getZimaOSInfraClient();
        const ssh = await infra.testConnection();
        if (ssh.ok) {
          return new Response(
            JSON.stringify({
              reachable: true,
              gatewayUrl,
              sessionCount: 0,
              runningCount: 0,
              via: 'ssh-fallback',
              hint: 'Connexion SSH distante OK (gateway runtime indisponible temporairement).',
              zimaosDebug: {
                ...configMeta,
                accessMode,
                attempts: [{ via: '/health', ok: false, status: health.status, parsedCount: 0 }],
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
      }
      return new Response(
        JSON.stringify({
          reachable: false,
          gatewayUrl,
          sessionCount: 0,
          runningCount: 0,
          error: health.error || 'Gateway injoignable',
          zimaosDebug: {
            ...configMeta,
            accessMode,
            attempts: [{ via: '/health', ok: false, status: health.status, parsedCount: 0 }],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const result = await fetchZimaOSSessionsPayload(undefined, {
      invokeOnly: true,
      sessionsListArgs: { limit: 40, messageLimit: 0 },
    });
    if (!result.ok) {
        return new Response(
            JSON.stringify({
                reachable: false,
                gatewayUrl,
                sessionCount: 0,
                runningCount: 0,
                error: result.error || 'Gateway injected error',
                zimaosDebug: { ...configMeta, accessMode, attempts: result.attempts },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
    }

    const sessions = normalizeZimaOSSessions(result.data);
    const isActuallyReachable = result.via !== '/health';
    const runningCount = sessions.length;
    return new Response(
        JSON.stringify({
            reachable: isActuallyReachable,
            gatewayUrl,
            sessionCount: sessions.length,
            runningCount,
            via: result.via,
            hint: !isActuallyReachable
              ? 'Gateway joignable (/health) mais API sessions inaccessible. Vérifiez ZIMAOS_GATEWAY_URL, token et endpoints /tools/invoke.'
              : undefined,
            zimaosDebug: { ...configMeta, accessMode, attempts: result.attempts, resolvedVia: result.via },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ reachable: false, gatewayUrl, error: e.message }), { status: 200 });
  }
};
