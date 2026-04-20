import type { APIRoute } from 'astro';
import { getAgentApiSecretsBundle } from '../../lib/custom-api-tokens-db';

/**
 * Jetons pour les agents sur le réseau local (même modèle que /api/forge-hook).
 * GET → { forgePublicUrl, githubToken, vercelToken, openclawToken, custom: { CLÉ: "secret", ... } }
 *
 * Exemple : `curl -s http://127.0.0.1:4321/api/agent-api-secrets`
 * (depuis la machine / LAN autorisé par le middleware).
 */
export const GET: APIRoute = async () => {
  try {
    const bundle = await getAgentApiSecretsBundle();
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
