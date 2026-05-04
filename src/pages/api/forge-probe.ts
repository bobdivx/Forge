import type { APIRoute } from 'astro';
import { probeZimaOSGatewayDraft } from '../../lib/forge-gateway';

/**
 * POST : teste URL + jeton ZimaOS fournis dans le corps (session requise).
 * Utilisé par l’assistant de configuration pour éviter de sauvegarder avant le test.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user?.email) {
    return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const zimaosGatewayUrl = String(body.zimaosGatewayUrl ?? '').trim();
  const zimaosToken = String(body.zimaosToken ?? '').trim();

  const r = await probeZimaOSGatewayDraft(zimaosGatewayUrl, zimaosToken);

  return new Response(
    JSON.stringify({
      reachable: r.reachable,
      sessionCount: r.sessionCount,
      error: r.error,
      httpStatus: r.status,
      probedUrl: zimaosGatewayUrl.replace(/\/$/, ''),
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};
