// @ts-nocheck
import type { APIRoute } from 'astro';
import { loadAstroDb } from '../../lib/load-astro-db';
import {
  fetchOpenClawSessionsPayload,
  normalizeOpenClawSessions,
  mapSessionToAgentRow,
} from '../../lib/openclaw-gateway';
import { findRawSessionForSwarmAgentKey } from '../../lib/swarm-agent-resolve';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function iso(d: unknown): string {
  if (d instanceof Date) return d.toISOString();
  if (d == null) return new Date(0).toISOString();
  return String(d);
}

function contentPreview(msg: Record<string, unknown>): string {
  const c = msg.content;
  if (typeof c === 'string' && c.trim()) return c.trim();
  if (Array.isArray(c)) {
    const parts: string[] = [];
    for (const block of c) {
      if (!block || typeof block !== 'object') continue;
      const b = block as Record<string, unknown>;
      if (typeof b.text === 'string') parts.push(b.text);
      else if (typeof b.content === 'string') parts.push(b.content);
    }
    const joined = parts.join('\n').trim();
    if (joined) return joined;
  }
  if (typeof msg.text === 'string') return msg.text.trim();
  return '';
}

function normalizeOpenClawMessages(raw: Record<string, unknown> | null, limit: number) {
  if (!raw) return [];
  const msgs = raw.messages;
  if (!Array.isArray(msgs)) return [];
  const slice = msgs.slice(-Math.max(1, Math.min(80, limit)));
  return slice.map((m, idx) => {
    if (!m || typeof m !== 'object') return null;
    const o = m as Record<string, unknown>;
    const role = String(o.role ?? o.type ?? 'message').toLowerCase();
    const preview = contentPreview(o).slice(0, 2000);
    const ts =
      o.timestamp ?? o.createdAt ?? o.updatedAt ?? o.time ?? o.ts ?? idx;
    return {
      role,
      preview: preview.length > 900 ? `${preview.slice(0, 900)}…` : preview,
      at: iso(typeof ts === 'number' || typeof ts === 'string' ? new Date(Number(ts) || ts) : new Date()),
    };
  }).filter(Boolean);
}

/** GET ?agentId=CHEF_TECHNIQUE — agrège session OpenClaw (messages) + tâches Astro DB pour la fiche swarm. */
export const GET: APIRoute = async ({ locals, url }) => {
  if (!locals.user?.email) {
    return json({ error: 'Non authentifié' }, 401);
  }
  const agentId = String(url.searchParams.get('agentId') || '').trim();
  if (!agentId) {
    return json({ error: 'agentId requis' }, 400);
  }

  const email = locals.user.email as string | undefined;

  let gatewayError: string | null = null;
  let rawSessions: Record<string, unknown>[] = [];
  const gw = await fetchOpenClawSessionsPayload(email, {
    invokeOnly: true,
    sessionsListArgs: { limit: 120, messageLimit: 48 },
  });
  if (gw.ok) {
    rawSessions = normalizeOpenClawSessions(gw.data) as Record<string, unknown>[];
  } else {
    gatewayError = gw.error || 'Gateway indisponible';
  }

  const matchedRaw = findRawSessionForSwarmAgentKey(rawSessions, agentId);
  const mapped = matchedRaw ? mapSessionToAgentRow(matchedRaw) : null;
  const openClaw = mapped
    ? {
        matched: true,
        sessionKey: mapped.id,
        status: mapped.status,
        model: mapped.model,
        lastSeen: mapped.lastSeen,
        lastSeenMs: mapped.lastSeenMs,
        messages: normalizeOpenClawMessages(matchedRaw, 48),
      }
    : { matched: false, sessionKey: null as string | null, status: null, model: null, lastSeen: null, lastSeenMs: 0, messages: [] };

  let dbTasks: unknown[] = [];
  try {
    const { db, AgentTask, eq, desc } = await loadAstroDb();
    dbTasks = await db
      .select()
      .from(AgentTask)
      .where(eq(AgentTask.agentId, agentId))
      .orderBy(desc(AgentTask.createdAt));
  } catch {
    dbTasks = [];
  }

  const missionTasks = dbTasks.map((t: any) => ({
    id: t.id,
    agentId: t.agentId,
    task: t.task,
    input: t.input ?? null,
    output: t.output ?? null,
    status: t.status,
    createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt),
    updatedAt: t.updatedAt instanceof Date ? t.updatedAt.toISOString() : String(t.updatedAt),
  }));

  const st = (s: string) => String(s ?? '').toLowerCase();
  const running = missionTasks.filter((t) => ['running', 'in_progress'].includes(st(t.status)));
  const pending = missionTasks.filter((t) => st(t.status) === 'pending');
  const recentDone = missionTasks.filter((t) =>
    ['completed', 'success', 'failed', 'bug', 'cancelled', 'resolved'].includes(st(t.status)),
  );

  return json({
    ok: true,
    agentId,
    gatewayError,
    openClaw,
    dbTasks: missionTasks,
    buckets: { running, pending, recentDone: recentDone.slice(0, 12) },
  });
};
