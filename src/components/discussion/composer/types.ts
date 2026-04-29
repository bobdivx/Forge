import type { AgentTeamProfile, ZimaOSAgentProfileRow } from '../../../lib/agent-profile';
import type { SwarmWorkCommand } from '../../../lib/forge-agent-protocol';

export type Project = { id: number; name: string; path: string; status: string | null };
export type RequestItem = {
  id: number;
  projectId: number | null;
  projectName: string | null;
  title: string;
  content: string;
  status: string;
  requestType: string | null;
  createdAt: string;
};
export type AgentRow = { id: string; name: string; status: string; model: string; raw?: { offline?: boolean; disabledInDb?: boolean } };

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  at: string;
  remediation?: GatewayRemediation;
  isAck?: boolean;
};

export type GatewayRemediation = {
  title?: string;
  endpoint?: string;
  endpointMethod?: string;
  where?: string;
  configPath?: string;
  instructions?: unknown;
  json?: string;
  curlTest?: string;
  powershellScript?: string;
  bashScript?: string;
  zimaosPrompt?: string;
  docs?: string;
};

export type RoutingDebugState = {
  requestedSessionKey: string;
  routedSessionKey: string;
  polledSessionKey: string;
  selectedSessionKey: string;
  via: string;
  lastReason: string;
};

export function truncateText(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

export function isSessionUsable(a: AgentRow): boolean {
  if (a.raw?.disabledInDb) return false;
  if (a.raw?.offline) return false;
  return !/désactivé/i.test(a.status);
}
