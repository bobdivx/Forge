import type { APIRoute } from 'astro';
import { fetchGeminiAvailableModels, getGeminiConfig } from '../../lib/gemini-provider';

/**
 * GET /api/gemini-models[?force=1]
 *   → Liste les modèles Gemini accessibles avec la clé API configurée.
 *     Aucun catalogue codé en dur : la liste vient toujours de `/v1beta/openai/models`.
 *     `?force=1` bypass le cache mémoire (TTL 5 min).
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
  const result = await fetchGeminiAvailableModels({
    apiKey: cfg.apiKey,
    baseUrl: cfg.baseUrl,
    force,
  });
  return new Response(
    JSON.stringify({
      ok: result.ok,
      configured: true,
      enabled: cfg.enabled,
      status: result.status,
      cached: result.cached,
      models: result.models,
      error: result.error,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};
