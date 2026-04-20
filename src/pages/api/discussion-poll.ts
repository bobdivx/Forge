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

function parseSessionUpdatedMs(raw: Record<string, unknown>): number {
  const n =
    (typeof raw.updatedAt === 'number' ? raw.updatedAt : NaN) ||
    (typeof raw.updated_at === 'number' ? raw.updated_at : NaN) ||
    (typeof raw.timestamp === 'number' ? raw.timestamp : NaN);
  if (Number.isFinite(n)) return Number(n);
  const s =
    (typeof raw.updatedAt === 'string' ? raw.updatedAt : '') ||
    (typeof raw.updated_at === 'string' ? raw.updated_at : '') ||
    (typeof raw.timestamp === 'string' ? raw.timestamp : '');
  if (!s) return 0;
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? ms : 0;
}

function sessionScore(raw: Record<string, unknown>, sessionKey: string): number {
  const want = toUpper(sessionKey);
  const key = toUpper(raw.key ?? raw.sessionKey ?? raw.session_key ?? '');
  const display = toUpper(raw.displayName ?? raw.display_name ?? raw.label ?? raw.name ?? '');
  const agent = toUpper(raw.agentId ?? raw.agent_id ?? '');

  let score = 0;
  if (key === want) score += 100;
  if (display === want || agent === want) score += 90;
  if (key.includes(want) || want.includes(key)) score += 70;
  if (display.includes(want) || agent.includes(want)) score += 60;
  // Les sessions webchat sont prioritaires pour la discussion UI.
  if (key.startsWith('WEBCHAT:')) score += 25;
  // Une session contenant des messages est en général la bonne cible.
  if (Array.isArray(raw.messages) && raw.messages.length > 0) score += 15;
  return score;
}

function resolveBestSession(
  sessions: Record<string, unknown>[],
  sessionKey: string,
): Record<string, unknown> | null {
  const candidates = sessions.filter((s) => sessionMatches(s, sessionKey));
  if (candidates.length === 0) return null;
  let best: Record<string, unknown> | null = null;
  let bestScore = -1;
  let bestUpdated = -1;
  for (const s of candidates) {
    const sc = sessionScore(s, sessionKey);
    const ms = parseSessionUpdatedMs(s);
    if (sc > bestScore || (sc === bestScore && ms > bestUpdated)) {
      best = s;
      bestScore = sc;
      bestUpdated = ms;
    }
  }
  return best;
}

function parseMessageTimestampMs(o: Record<string, unknown>): number {
  const n =
    (typeof o.createdAt === 'number' ? o.createdAt : NaN) ||
    (typeof o.created_at === 'number' ? o.created_at : NaN) ||
    (typeof o.timestamp === 'number' ? o.timestamp : NaN);
  if (Number.isFinite(n)) return Number(n);
  const s =
    (typeof o.createdAt === 'string' ? o.createdAt : '') ||
    (typeof o.created_at === 'string' ? o.created_at : '') ||
    (typeof o.timestamp === 'string' ? o.timestamp : '');
  if (!s) return 0;
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? ms : 0;
}

function pickLatestAssistantMessage(
  raw: Record<string, unknown>,
  afterMs: number,
): { text: string; at?: string } | null {
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
    const tsMs = parseMessageTimestampMs(o);
    if (afterMs > 0 && tsMs > 0 && tsMs < afterMs) continue;
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
  const raw = resolveBestSession(sessions, sessionKey);
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
