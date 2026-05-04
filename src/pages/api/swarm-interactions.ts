// @ts-nocheck
import type { APIRoute } from 'astro';
import { db, AgentMessage, AgentTask, AgentInstruction, desc } from 'astro:db';
import { FORGE_PROJECT_CHILD_TOKEN } from '../../lib/forge-project-scoped-agents';
import { shortSwarmLabel } from '../../lib/swarm-interactions';

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

export const GET: APIRoute = async () => {
  let instructions = [];
  let messages = [];
  let tasks = [];
  let edges = [];
  const agentIds = new Set<string>();

  try {
    instructions = await db.select().from(AgentInstruction);
    for (const a of instructions) {
      const id = String(a.agentId || '').trim();
      if (id) agentIds.add(id);
      const idx = id.indexOf(FORGE_PROJECT_CHILD_TOKEN);
      if (idx > 0) {
        const parent = id.slice(0, idx);
        edges.push({
          from: parent,
          to: id,
          fromLabel: shortSwarmLabel(parent),
          toLabel: shortSwarmLabel(id),
          kind: 'subagent',
          atLabel: fmt(a.updatedAt),
          at: ts(a.updatedAt),
        });
      }
    }
  } catch {
    /* table absente ou DB off */
  }
  try {
    messages = await db.select().from(AgentMessage).orderBy(desc(AgentMessage.timestamp)).limit(120);
    for (const m of messages) {
      if (m.fromAgent) agentIds.add(String(m.fromAgent));
      if (m.toAgent) agentIds.add(String(m.toAgent));
    }
  } catch {
    /* table absente ou DB off */
  }
  try {
    tasks = await db.select().from(AgentTask).orderBy(desc(AgentTask.createdAt)).limit(120);
    for (const t of tasks) {
      if (t.agentId) agentIds.add(String(t.agentId));
    }
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
      summary: 'Lien agent parent → sous-agent applicatif Forge',
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
      stats: {
        totalSessions: instructions.length,
        activeCount: instructions.filter((a) => Number(a.enabled) === 1).length,
        idleCount: instructions.filter((a) => Number(a.enabled) !== 1).length,
        uniqueAgents: agentIds.size,
        edgeCount: edges.length,
        messageCount: messages.length,
        taskCount: tasks.length,
      },
      edges,
      timeline,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};
