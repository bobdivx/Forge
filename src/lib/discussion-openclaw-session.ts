/**
 * Résolution de session OpenClaw + extraction de messages pour la page Discussion
 * (poll en direct + historique au chargement).
 */
import { fetchOpenClawSessionsPayload, normalizeOpenClawSessions } from './openclaw-gateway';

function toUpper(v: unknown): string {
  return String(v ?? '').trim().toUpperCase();
}

export function sessionMatchesOpenClaw(raw: Record<string, unknown>, sessionKey: string): boolean {
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

export function getOpenClawSessionMessagesArray(raw: Record<string, unknown>): unknown[] {
  const direct = raw.messages;
  if (Array.isArray(direct) && direct.length > 0) return direct;
  for (const key of ['chat', 'history', 'turns', 'recentMessages', 'items', 'entries'] as const) {
    const v = raw[key];
    if (Array.isArray(v) && v.length > 0) return v;
  }
  return Array.isArray(direct) ? direct : [];
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
  if (key.startsWith('WEBCHAT:')) score += 25;
  const msgArr = getOpenClawSessionMessagesArray(raw);
  if (msgArr.length > 0) score += 15;
  return score;
}

export function resolveBestOpenClawSessionForKey(
  sessions: Record<string, unknown>[],
  sessionKey: string,
): Record<string, unknown> | null {
  const candidates = sessions.filter((s) => sessionMatchesOpenClaw(s, sessionKey));
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

/** Tolérance horloge client vs serveur (poll après envoi). */
export const DISCUSSION_CLIENT_SERVER_CLOCK_SKEW_MS = 15 * 60 * 1000;

function normalizeEpochToMs(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return NaN;
  if (n < 1e12 && n > 1e9) return Math.floor(n * 1000);
  return Math.floor(n);
}

export function parseOpenClawMessageTimestampMs(o: Record<string, unknown>): number {
  const n =
    (typeof o.createdAt === 'number' ? normalizeEpochToMs(o.createdAt) : NaN) ||
    (typeof o.created_at === 'number' ? normalizeEpochToMs(o.created_at) : NaN) ||
    (typeof o.timestamp === 'number' ? normalizeEpochToMs(o.timestamp) : NaN);
  if (Number.isFinite(n)) return Number(n);
  const s =
    (typeof o.createdAt === 'string' ? o.createdAt : '') ||
    (typeof o.created_at === 'string' ? o.created_at : '') ||
    (typeof o.timestamp === 'string' ? o.timestamp : '');
  if (!s) return 0;
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? ms : 0;
}

export function extractOpenClawMessageText(o: Record<string, unknown>): string {
  const content = o.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const part of content) {
      if (part == null || typeof part !== 'object') continue;
      const p = part as Record<string, unknown>;
      if (typeof p.text === 'string') parts.push(p.text);
      else if (typeof p.content === 'string') parts.push(p.content);
      else if (p.type === 'text' && typeof p.text === 'string') parts.push(p.text);
    }
    return parts.join('').trim();
  }
  if (typeof o.text === 'string') return o.text.trim();
  if (typeof o.message === 'string') return o.message.trim();
  return '';
}

function classifyDiscussionRole(o: Record<string, unknown>): 'user' | 'assistant' | null {
  const role = String(o.role ?? o.type ?? '').toLowerCase();
  if (['assistant', 'ai', 'model', 'bot', 'agent'].includes(role)) return 'assistant';
  if (['user', 'human', 'client', 'input'].includes(role)) return 'user';
  return null;
}

export function pickLatestAssistantMessage(
  raw: Record<string, unknown>,
  afterMs: number,
): { text: string; at?: string } | null {
  const msgs = getOpenClawSessionMessagesArray(raw);
  if (!msgs.length) return null;
  for (let i = msgs.length - 1; i >= 0; i -= 1) {
    const m = msgs[i];
    if (m == null || typeof m !== 'object') continue;
    const o = m as Record<string, unknown>;
    if (classifyDiscussionRole(o) !== 'assistant') continue;
    const text = extractOpenClawMessageText(o);
    if (!text) continue;
    const tsMs = parseOpenClawMessageTimestampMs(o);
    if (afterMs > 0 && tsMs > 0 && tsMs < afterMs - DISCUSSION_CLIENT_SERVER_CLOCK_SKEW_MS) continue;
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

export type DiscussionHistoryMessage = {
  role: 'user' | 'assistant';
  text: string;
  /** Heure courte affichable (navigateur fera re-render si besoin). */
  atDisplay: string;
  sortMs: number;
};

function formatAtDisplay(sortMs: number): string {
  if (sortMs > 0 && sortMs < 1e15) {
    try {
      return new Date(sortMs).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      /* ignore */
    }
  }
  return '--:--';
}

/**
 * Construit l’historique chat (user + assistant) dans l’ordre OpenClaw, pour réhydrater l’UI après F5.
 */
export function buildOpenClawDiscussionHistory(
  raw: Record<string, unknown>,
  opts?: { max?: number },
): DiscussionHistoryMessage[] {
  const max = opts?.max ?? 100;
  const msgs = getOpenClawSessionMessagesArray(raw);
  const out: DiscussionHistoryMessage[] = [];
  let seq = 0;
  const ORDER_BASE_MS = 1_700_000_000_000;
  for (const m of msgs) {
    if (m == null || typeof m !== 'object') continue;
    const o = m as Record<string, unknown>;
    const role = classifyDiscussionRole(o);
    if (!role) continue;
    const text = extractOpenClawMessageText(o);
    if (!text.trim()) continue;
    const parsedMs = parseOpenClawMessageTimestampMs(o);
    const orderMs = parsedMs > 0 ? parsedMs : ORDER_BASE_MS + seq;
    seq += 1;
    out.push({
      role,
      text: text.slice(0, 8000),
      atDisplay: parsedMs > 0 ? formatAtDisplay(parsedMs) : '--:--',
      sortMs: orderMs,
    });
  }
  out.sort((a, b) => a.sortMs - b.sortMs);
  if (out.length > max) return out.slice(-max);
  return out;
}

export type FetchDiscussionSessionsResult = {
  ok: boolean;
  error?: string;
  sessions: Record<string, unknown>[];
};

/** sessions_list invoke (même source que poll / historique). */
export async function fetchOpenClawSessionsForDiscussion(
  email: string | undefined,
  messageLimit = 120,
): Promise<FetchDiscussionSessionsResult> {
  const payload = await fetchOpenClawSessionsPayload(email, {
    invokeOnly: true,
    sessionsListArgs: { limit: 120, messageLimit },
  });
  if (!payload.ok) {
    return { ok: false, error: payload.error || 'sessions_list indisponible', sessions: [] };
  }
  const sessions = normalizeOpenClawSessions(payload.data) as Record<string, unknown>[];
  return { ok: true, sessions };
}
