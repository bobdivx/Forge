import type { APIRoute } from 'astro';
import { probeOpenClawGatewayDraft } from '../../lib/openclaw-gateway';

/**
 * POST : teste URL + jeton OpenClaw fournis dans le corps (session requise).
 * Utilisé par l’assistant de configuration pour éviter de sauvegarder avant le test.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user?.email) {
    return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const openclawGatewayUrl = String(body.openclawGatewayUrl ?? '').trim();
  const openclawToken = String(body.openclawToken ?? '').trim();

  const r = await probeOpenClawGatewayDraft(openclawGatewayUrl, openclawToken);

  return new Response(
    JSON.stringify({
      reachable: r.reachable,
      sessionCount: r.sessionCount,
      error: r.error,
      httpStatus: r.status,
      probedUrl: openclawGatewayUrl.replace(/\/$/, ''),
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};
