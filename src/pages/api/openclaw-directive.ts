import type { APIRoute } from 'astro';
import { invokeOpenClawSessionsSend, invokeOpenClawAgentTask } from '../../lib/openclaw-gateway';

const MAX_MESSAGE = 120_000;

/**
 * Envoie un message utilisateur dans une session agent.
 * Priorité: sessions_send ; fallback: agents_invoke quand sessions_send est bloqué en gateway.
 */
export const POST: APIRoute = async ({ request }) => {
  let body: { sessionKey?: string; message?: string; timeoutSeconds?: number };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'JSON invalide' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const sessionKey = String(body.sessionKey || '').trim();
  const message = String(body.message || '').trim();
  if (!sessionKey || !message) {
    return new Response(JSON.stringify({ error: 'sessionKey et message requis' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (message.length > MAX_MESSAGE) {
    return new Response(JSON.stringify({ error: 'Message trop long' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const timeoutSeconds =
    typeof body.timeoutSeconds === 'number' && body.timeoutSeconds >= 0 && body.timeoutSeconds <= 600
      ? Math.floor(body.timeoutSeconds)
      : 120;

  const result = await invokeOpenClawSessionsSend({
    sessionKey,
    message,
    timeoutSeconds,
    asyncDelivery: false,
  });

  if (result.ok) {
    return new Response(JSON.stringify(result.detail ?? { ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Fallback robuste : si sessions_send est bloqué par la gateway,
  // essayer agents_invoke avec l'identifiant agent.
  if (result.httpStatus === 404 || /sessions_send/i.test(String(result.error || ''))) {
    const fallback = await invokeOpenClawAgentTask({
      agentId: sessionKey,
      message,
    });
    if (fallback.ok) {
      return new Response(
        JSON.stringify({
          ok: true,
          via: 'agents_invoke_fallback',
          detail: fallback.detail ?? { accepted: true },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }
    return new Response(
      JSON.stringify({
        error: fallback.error || result.error,
        detail: { sessionsSend: result.detail, agentsInvoke: fallback.detail },
      }),
      {
        status: fallback.httpStatus && fallback.httpStatus >= 400 ? fallback.httpStatus : 502,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  {
    const status =
      result.httpStatus === 404 ? 502 : result.httpStatus && result.httpStatus >= 400 ? result.httpStatus : 502;
    return new Response(JSON.stringify({ error: result.error, detail: result.detail }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
