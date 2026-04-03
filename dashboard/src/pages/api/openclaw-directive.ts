import type { APIRoute } from 'astro';
import { getOpenClawToken } from '../../lib/auth';
import { getOpenClawGatewayBaseUrl, getGatewayAuthHeaders } from '../../lib/openclaw-gateway';

const MAX_MESSAGE = 120_000;

/**
 * Envoie un message utilisateur dans une session agent (outil gateway sessions_send).
 * Nécessite que le gateway autorise sessions_send sur /tools/invoke (sinon 404 : voir gateway.tools.allow).
 */
export const POST: APIRoute = async ({ request, locals }) => {
  const email = locals.user?.email;
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

  const token = getOpenClawToken(email);
  if (!token) {
    return new Response(
      JSON.stringify({ error: 'Token OpenClaw manquant (Paramètres du compte).' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const base = getOpenClawGatewayBaseUrl(email);
  const url = `${base}/tools/invoke`;
  const timeoutSeconds =
    typeof body.timeoutSeconds === 'number' && body.timeoutSeconds >= 0 && body.timeoutSeconds <= 600
      ? Math.floor(body.timeoutSeconds)
      : 120;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...getGatewayAuthHeaders(token),
      },
      body: JSON.stringify({
        tool: 'sessions_send',
        action: 'json',
        args: {
          sessionKey,
          message,
          timeoutSeconds,
        },
        sessionKey,
        dryRun: false,
      }),
    });

    const text = await res.text();
    let data: Record<string, unknown> = {};
    try {
      data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      data = { raw: text };
    }

    if (res.status === 404) {
      return new Response(
        JSON.stringify({
          error:
            'Outil sessions_send indisponible via HTTP (souvent bloqué par défaut). Dans la config OpenClaw gateway, ajoutez par exemple : gateway.tools.allow: ["sessions_send"] — voir https://openclaws.io/docs/gateway/tools-invoke-http-api',
          detail: data,
        }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!res.ok) {
      const errMsg =
        (data.error as { message?: string })?.message ||
        (typeof data.error === 'string' ? data.error : null) ||
        (data.message as string) ||
        `Gateway HTTP ${res.status}`;
      return new Response(JSON.stringify({ error: errMsg, detail: data }), {
        status: res.status >= 400 ? res.status : 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (data.ok === false) {
      const errMsg =
        (data.error as { message?: string })?.message ||
        (typeof data.error === 'string' ? data.error : null) ||
        'Gateway a refusé la directive';
      return new Response(JSON.stringify({ error: errMsg, detail: data }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur réseau';
    return new Response(JSON.stringify({ error: msg }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
