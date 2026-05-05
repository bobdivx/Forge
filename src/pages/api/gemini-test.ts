import type { APIRoute } from 'astro';
import {
  fetchGeminiAvailableModels,
  getGeminiConfig,
  pingGemini,
} from '../../lib/gemini-provider';

/**
 * POST /api/gemini-test
 *   Body (optionnel) : { model?: string, apiKey?: string, baseUrl?: string, message?: string }
 *
 *   - Sans `apiKey` dans le body : utilise la clé enregistrée en base.
 *   - Avec `apiKey` : teste la clé sans la sauvegarder (utile pour le formulaire).
 *   - Sans `model` : récupère le premier modèle exposé par l'API Gemini.
 */
export const POST: APIRoute = async ({ request }) => {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const stored = await getGeminiConfig();
  const apiKey = String(body.apiKey ?? stored.apiKey ?? '').trim();
  const baseUrl = String(body.baseUrl ?? stored.baseUrl ?? '').trim();
  const message = String(body.message ?? '').trim() || undefined;

  if (!apiKey) {
    return new Response(
      JSON.stringify({ ok: false, status: 401, error: 'Clé API Gemini absente.' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  let model = String(body.model ?? '').trim();
  if (!model) {
    const discovered = await fetchGeminiAvailableModels({ apiKey, baseUrl });
    model = discovered.models[0]?.id || '';
    if (!model) {
      return new Response(
        JSON.stringify({
          ok: false,
          status: discovered.status || 502,
          error:
            discovered.error ||
            'Aucun modèle Gemini exposé par l’API. Vérifiez la clé / l’URL puis réessayez.',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
  }

  const result = await pingGemini({ model, apiKey, baseUrl, userMessage: message });
  return new Response(JSON.stringify({ ...result, model }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
