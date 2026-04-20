import type { APIRoute } from 'astro';
import {
  fetchOpenClawSessionsForDiscussion,
  resolveBestOpenClawSessionForKey,
  buildOpenClawDiscussionHistory,
} from '../../lib/discussion-openclaw-session';

/**
 * POST : historique user + assistant pour une session OpenClaw (réhydrate Discussion après F5).
 * Corps : `{ "sessionKey": "…", "maxMessages"?: number }` (maxMessages défaut 100, plafond 200).
 */
export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user?.email) {
    return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const sessionKey = String(body.sessionKey || '').trim();
  const maxRaw = body.maxMessages;
  const maxMessages =
    typeof maxRaw === 'number' && Number.isFinite(maxRaw) && maxRaw > 0 && maxRaw <= 200
      ? Math.floor(maxRaw)
      : 100;

  if (!sessionKey) {
    return new Response(JSON.stringify({ error: 'sessionKey requis' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const list = await fetchOpenClawSessionsForDiscussion(locals.user.email as string, 120);
  if (!list.ok) {
    return new Response(
      JSON.stringify({ ok: false, error: list.error || 'sessions_list indisponible', messages: [] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const raw = resolveBestOpenClawSessionForKey(list.sessions, sessionKey);
  const selectedSessionKey = raw
    ? String(raw.key ?? raw.sessionKey ?? raw.session_key ?? '')
    : '';

  if (!raw) {
    return new Response(
      JSON.stringify({
        ok: true,
        messages: [],
        reason: 'session_non_trouvee',
        selectedSessionKey: '',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const messages = buildOpenClawDiscussionHistory(raw, { max: maxMessages });

  return new Response(
    JSON.stringify({
      ok: true,
      messages,
      selectedSessionKey,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};
