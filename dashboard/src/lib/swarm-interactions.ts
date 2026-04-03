// @ts-nocheck
import { mapSessionToAgentRow } from './openclaw-gateway';

/**
 * Déduit la session parente pour une clé sub-agent OpenClaw.
 * Ex. agent:main:subagent:abc → agent:main:main
 */
export function inferParentSessionKey(sessionKey: string): string | null {
  const marker = ':subagent:';
  const i = sessionKey.indexOf(marker);
  if (i < 0) return null;
  const prefix = sessionKey.slice(0, i);
  if (!prefix) return null;
  return `${prefix}:main`;
}

export function shortSwarmLabel(idOrName: string): string {
  const s = String(idOrName || '');
  if (s.includes('subagent:')) {
    const tail = s.split(':').pop() || '';
    return `Sub…${tail.slice(0, 8)}`;
  }
  return s
    .replace(/telegram:g-agent-/i, '')
    .replace(/^agent:/, '')
    .replace(/:main$/i, '')
    .slice(0, 28) || s.slice(0, 24);
}

export type InteractionEdge = {
  from: string;
  to: string;
  fromLabel: string;
  toLabel: string;
  kind: 'subagent';
  at: number;
  atLabel: string;
};

export type InteractionEvent = {
  id: string;
  kind: 'topology' | 'message' | 'task';
  from: string;
  to: string;
  fromLabel: string;
  toLabel: string;
  summary: string;
  at: number;
  atLabel: string;
};

export function buildEdgesFromSessions(sessions: unknown[]): InteractionEdge[] {
  const rows = sessions.map(mapSessionToAgentRow);
  const ids = new Set(rows.map((r) => r.id));
  const edges: InteractionEdge[] = [];

  for (const r of rows) {
    const parent = inferParentSessionKey(r.id);
    if (parent && ids.has(parent)) {
      edges.push({
        from: parent,
        to: r.id,
        fromLabel: shortSwarmLabel(parent),
        toLabel: shortSwarmLabel(r.id),
        kind: 'subagent',
        at: r.lastSeenMs,
        atLabel: r.lastSeen,
      });
    }
  }

  return edges.sort((a, b) => b.at - a.at);
}
