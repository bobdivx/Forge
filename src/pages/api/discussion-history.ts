import type { APIRoute } from 'astro';
import { desc, eq } from 'drizzle-orm';
import { loadAstroDb } from '../../lib/load-astro-db';
import {
  fetchZimaOSSessionsForDiscussion,
  resolveBestZimaOSSessionForKey,
  buildZimaOSDiscussionHistory,
} from '../../lib/discussion-forge-session';

/**
 * POST : historique user + assistant pour une session ZimaOS (réhydrate Discussion après F5).
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

  // Chemin principal Forge-native : historique persisté localement.
  try {
    const { db, ForgeChatMessage } = await loadAstroDb();
    const local = await db
      .select()
      .from(ForgeChatMessage)
      .where(eq(ForgeChatMessage.sessionId, sessionKey))
      .orderBy(desc(ForgeChatMessage.createdAt))
      .limit(maxMessages);
    if (local.length > 0) {
      return new Response(
        JSON.stringify({
          ok: true,
          messages: local.reverse().map((m) => {
            let meta: Record<string, unknown> = {};
            try {
              meta = m.meta ? JSON.parse(m.meta) as Record<string, unknown> : {};
            } catch {}
            return {
              id: `forge-msg-${m.id}`,
              role: m.role,
              text: m.content,
              at: new Date(m.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
              steps: Array.isArray(meta.steps) ? meta.steps : undefined,
              turnId: typeof meta.turnId === 'string' ? meta.turnId : undefined,
            };
          }),
          selectedSessionKey: sessionKey,
          source: 'forge',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
  } catch {
    // fallback below
  }

  const list = await fetchZimaOSSessionsForDiscussion(locals.user.email as string, 120);
  if (!list.ok) {
    return new Response(
      JSON.stringify({ ok: false, error: list.error || 'sessions_list indisponible', messages: [] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const raw = resolveBestZimaOSSessionForKey(list.sessions, sessionKey);
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

  const messages = buildZimaOSDiscussionHistory(raw, { max: maxMessages });

  return new Response(
    JSON.stringify({
      ok: true,
      messages,
      selectedSessionKey,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};
