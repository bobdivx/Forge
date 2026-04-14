import type { APIRoute } from 'astro';
import { pingOpenClawChatCompletion } from '../../lib/openclaw-openai-surface';

/**
 * POST { openAiModel, backendModel?, userMessage?, maxTokens? }
 * Mesure la latence d’un appel minimal à POST /v1/chat/completions sur le gateway.
 */
export const POST: APIRoute = async ({ request }) => {
  let body: {
    openAiModel?: string;
    backendModel?: string;
    userMessage?: string;
    maxTokens?: number;
  };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'JSON invalide' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const openAiModel = String(body.openAiModel || '').trim();
  if (!openAiModel) {
    return new Response(JSON.stringify({ error: 'openAiModel requis (ex. openclaw/DEV_FRONTEND).' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const result = await pingOpenClawChatCompletion({
    openAiModel,
    backendModel: body.backendModel != null ? String(body.backendModel) : undefined,
    userMessage: body.userMessage != null ? String(body.userMessage) : undefined,
    maxTokens:
      typeof body.maxTokens === 'number' && Number.isFinite(body.maxTokens)
        ? body.maxTokens
        : undefined,
  });

  if (!result.ok && result.status === 404) {
    return new Response(
      JSON.stringify({
        ...result,
        hint:
          'Surface /v1/chat/completions absente ou refusée. Activez gateway.http.endpoints.chatCompletions et vérifiez gateway.tools.allow sur OpenClaw.',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
