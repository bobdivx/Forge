import type { APIRoute } from 'astro';
import { getAgentApiSecretsBundle } from '../../../lib/custom-api-tokens-db';

/**
 * Alias compatibilité pour agents OpenClaw:
 * GET /api/config/secrets?agentId=DEV_BACKEND
 */
export const GET: APIRoute = async ({ url }) => {
  try {
    const agentId = String(url.searchParams.get('agentId') || '').trim();
    const bundle = await getAgentApiSecretsBundle(agentId || undefined);
    return new Response(JSON.stringify(bundle), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
