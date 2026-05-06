import type { APIRoute } from 'astro';
import { getGeminiConfig } from '../../lib/gemini-provider';
import { getFunctionalGeminiModels } from '../../lib/gemini-model-availability';

/**
 * GET /api/gemini-models[?force=1]
 *   → Liste uniquement les modèles Gemini réellement fonctionnels.
 *     Les IDs sont d'abord découverts via `/v1beta/openai/models`, puis testés
 *     par un ping conversationnel léger.
 *     `?force=1` bypass le cache des sondes.
 */
export const GET: APIRoute = async ({ request }) => {
  const cfg = await getGeminiConfig();
  if (!cfg.apiKey) {
    return new Response(
      JSON.stringify({
        ok: false,
        configured: false,
        enabled: cfg.enabled,
        models: [],
        error: 'Clé API Gemini absente.',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const force = new URL(request.url).searchParams.get('force') === '1';
  const result = await getFunctionalGeminiModels({
    force,
    // Probe l'ensemble de la liste découverte pour ne proposer que du réellement valide.
    maxProbe: Number.MAX_SAFE_INTEGER,
  });
  return new Response(
    JSON.stringify({
      ok: result.ok,
      configured: true,
      enabled: cfg.enabled,
      models: result.models,
      error: result.error,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};
