import type { APIRoute } from 'astro';
import { fetchOpenClawSessionsPayload, normalizeOpenClawSessions } from '../../lib/openclaw-gateway';

function toUpper(v: unknown): string {
  return String(v ?? '').trim().toUpperCase();
}

function sessionMatches(raw: Record<string, unknown>, sessionKey: string): boolean {
  const want = toUpper(sessionKey);
  if (!want) return false;
  const candidates = [
    raw.sessionKey,
    raw.session_key,
    raw.key,
    raw.id,
    raw.agentId,
    raw.agent_id,
    raw.displayName,
    raw.display_name,
    raw.label,
    raw.name,
  ].map(toUpper);
  return candidates.some((v) => v && (v === want || v.includes(want)));
}

function pickLatestAssistantMessage(raw: Record<string, unknown>): { text: string; at?: string } | null {
  const msgs = raw.messages;
  if (!Array.isArray(msgs) || msgs.length === 0) return null;
  for (let i = msgs.length - 1; i >= 0; i -= 1) {
    const m = msgs[i];
    if (m == null || typeof m !== 'object') continue;
    const o = m as Record<string, unknown>;
    const role = String(o.role ?? o.type ?? '').toLowerCase();
    if (role !== 'assistant' && role !== 'ai' && role !== 'model') continue;
    const content =
      typeof o.content === 'string'
        ? o.content
        : typeof o.text === 'string'
          ? o.text
          : typeof o.message === 'string'
            ? o.message
            : '';
    const text = content.trim();
    if (!text) continue;
    const at =
      typeof o.createdAt === 'string'
        ? o.createdAt
        : typeof o.created_at === 'string'
          ? o.created_at
          : typeof o.timestamp === 'string'
            ? o.timestamp
            : undefined;
    return { text: text.slice(0, 8000), at };
  }
  return null;
}

export const GET: APIRoute = async ({ request, locals }) => {
  const url = new URL(request.url);
  const sessionKey = String(url.searchParams.get('sessionKey') || '').trim();
  if (!sessionKey) {
    return new Response(JSON.stringify({ error: 'sessionKey requis' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const email = locals.user?.email as string | undefined;
  const payload = await fetchOpenClawSessionsPayload(email, {
    invokeOnly: true,
    sessionsListArgs: { limit: 120, messageLimit: 40 },
  });

  if (!payload.ok) {
    return new Response(
      JSON.stringify({
        ok: false,
        pending: true,
        error: payload.error || 'sessions_list indisponible',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const sessions = normalizeOpenClawSessions(payload.data) as Record<string, unknown>[];
  const raw = sessions.find((s) => sessionMatches(s, sessionKey));
  if (!raw) {
    return new Response(JSON.stringify({ ok: true, pending: true, reason: 'session_non_trouvee' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const msg = pickLatestAssistantMessage(raw);
  if (!msg) {
    return new Response(JSON.stringify({ ok: true, pending: true, reason: 'pas_de_reponse_assistant' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      pending: false,
      reply: msg.text,
      at: msg.at,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};
