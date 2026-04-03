// @ts-nocheck
import type { APIRoute } from 'astro';
import { db, AgentMessage, AgentTask, desc } from 'astro:db';
import {
  fetchOpenClawJson,
  normalizeOpenClawSessions,
  mapSessionToAgentRow,
} from '../../lib/openclaw-gateway';
import { buildEdgesFromSessions, shortSwarmLabel } from '../../lib/swarm-interactions';

function ts(d: Date | number | null | undefined): number {
  if (d == null) return 0;
  if (typeof d === 'number') return d;
  const t = d.getTime();
  return Number.isFinite(t) ? t : 0;
}

function fmt(d: Date | number | null | undefined): string {
  if (d == null) return '—';
  const date = typeof d === 'number' ? new Date(d) : d;
  return date.toLocaleString('fr-FR');
}

export const GET: APIRoute = async ({ locals }) => {
  const email = locals.user?.email;

  let sessions: unknown[] = [];
  let gatewayError: string | null = null;
  const health = await fetchOpenClawJson(email, '/health');
  if (health.ok) {
    sessions = normalizeOpenClawSessions(health.data);
  } else {
    gatewayError = health.error || 'Gateway indisponible';
  }

  const rows = sessions.map(mapSessionToAgentRow);
  rows.sort((a, b) => b.lastSeenMs - a.lastSeenMs);
  const activeCount = rows.filter((r) => r.status === 'actif').length;
  const edges = buildEdgesFromSessions(sessions);

  let messages = [];
  let tasks = [];
  try {
    messages = await db.select().from(AgentMessage).orderBy(desc(AgentMessage.timestamp)).limit(120);
  } catch {
    /* table absente ou DB off */
  }
  try {
    tasks = await db.select().from(AgentTask).orderBy(desc(AgentTask.createdAt)).limit(120);
  } catch {
    /* */
  }

  const timeline = [];

  for (const e of edges) {
    timeline.push({
      id: `topo-${e.from}-${e.to}-${e.at}`,
      kind: 'topology',
      from: e.from,
      to: e.to,
      fromLabel: e.fromLabel,
      toLabel: e.toLabel,
      summary: 'Lien principal → sub-agent (session OpenClaw)',
      at: e.at,
      atLabel: e.atLabel,
    });
  }

  for (const m of messages) {
    const t = ts(m.timestamp);
    timeline.push({
      id: `msg-${m.id}`,
      kind: 'message',
      from: m.fromAgent,
      to: m.toAgent || '—',
      fromLabel: shortSwarmLabel(m.fromAgent),
      toLabel: m.toAgent ? shortSwarmLabel(m.toAgent) : '—',
      summary: m.content.length > 220 ? `${m.content.slice(0, 220)}…` : m.content,
      at: t,
      atLabel: fmt(m.timestamp),
    });
  }

  for (const t of tasks) {
    const time = ts(t.createdAt);
    timeline.push({
      id: `task-${t.id}`,
      kind: 'task',
      from: 'Orchestration',
      to: t.agentId,
      fromLabel: 'Orchestration',
      toLabel: shortSwarmLabel(t.agentId),
      summary: [t.task, t.input ? `· ${String(t.input).slice(0, 120)}` : ''].filter(Boolean).join(' '),
      at: time,
      atLabel: fmt(t.createdAt),
    });
  }

  timeline.sort((a, b) => b.at - a.at);

  return new Response(
    JSON.stringify({
      gatewayError,
      stats: {
        totalSessions: rows.length,
        activeCount,
        idleCount: Math.max(0, rows.length - activeCount),
        uniqueAgents: new Set(rows.map((r) => r.name)).size,
        edgeCount: edges.length,
        messageCount: messages.length,
        taskCount: tasks.length,
      },
      sessions: rows.slice(0, 40).map((r) => ({
        id: r.id,
        name: r.name,
        shortLabel: shortSwarmLabel(r.id),
        status: r.status,
        model: r.model,
        lastSeen: r.lastSeen,
        lastSeenMs: r.lastSeenMs,
      })),
      edges,
      timeline,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};
