import type { APIRoute } from 'astro';
import {
  fetchOpenClawSessionsForDiscussion,
  resolveBestOpenClawSessionForKey,
  pickLatestAssistantMessage,
} from '../../lib/discussion-openclaw-session';

export const POST: APIRoute = async ({ request, locals }) => {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const sessionKey = String(body.sessionKey || '').trim();
  const afterMs =
    typeof body.afterMs === 'number' && Number.isFinite(body.afterMs) ? Math.floor(body.afterMs) : 0;
  if (!sessionKey) {
    return new Response(JSON.stringify({ error: 'sessionKey requis' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const email = locals.user?.email as string | undefined;
  const list = await fetchOpenClawSessionsForDiscussion(email, 80);
  if (!list.ok) {
    return new Response(
      JSON.stringify({
        ok: false,
        pending: true,
        error: list.error || 'sessions_list indisponible',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const raw = resolveBestOpenClawSessionForKey(list.sessions, sessionKey);
  if (!raw) {
    return new Response(JSON.stringify({ ok: true, pending: true, reason: 'session_non_trouvee' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const msg = pickLatestAssistantMessage(raw, afterMs);
  if (!msg) {
    return new Response(
      JSON.stringify({
        ok: true,
        pending: true,
        reason: 'pas_de_reponse_assistant',
        selectedSessionKey: String(raw.key ?? raw.sessionKey ?? raw.session_key ?? ''),
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      pending: false,
      reply: msg.text,
      at: msg.at,
      selectedSessionKey: String(raw.key ?? raw.sessionKey ?? raw.session_key ?? ''),
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};
