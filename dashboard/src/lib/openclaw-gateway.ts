// @ts-nocheck
/**
 * Appels au gateway OpenClaw (openclaw.json → gateway.port, gateway.auth.token).
 * URL : OPENCLAW_GATEWAY_URL (env) > openclawGatewayUrl (paramètres Forge) > http://127.0.0.1:18789
 */
import { getOpenClawToken, readAppSettings } from './auth';

export function getOpenClawGatewayBaseUrl(email?: string): string {
  const env = process.env.OPENCLAW_GATEWAY_URL?.trim();
  if (env) return env.replace(/\/$/, '');
  if (email) {
    const s = readAppSettings(email);
    const fromUser = String(s?.openclawGatewayUrl || '').trim();
    if (fromUser) return fromUser.replace(/\/$/, '');
  }
  return 'http://127.0.0.1:18789';
}

export function getGatewayAuthHeaders(token: string): Record<string, string> {
  return {
    'X-Gateway-Token': token,
    Authorization: `Bearer ${token}`,
  };
}

export async function fetchOpenClawJson(
  email: string | undefined,
  path: string,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; data: any; error?: string }> {
  const token = getOpenClawToken(email);
  if (!token) {
    return { ok: false, status: 401, data: null, error: 'Token OpenClaw manquant (Paramètres).' };
  }
  const base = getOpenClawGatewayBaseUrl(email);
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...getGatewayAuthHeaders(token),
        ...(init?.headers as Record<string, string>),
      },
    });
    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        data,
        error: data?.error || data?.message || `HTTP ${res.status}`,
      };
    }
    return { ok: true, status: res.status, data };
  } catch (e: any) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: e?.message || 'Gateway injoignable',
    };
  }
}

/** Normalise la liste des sessions (plusieurs formes de réponse possibles). */
export function normalizeOpenClawSessions(payload: any): any[] {
  if (!payload) return [];
  // Support .sessions array (new RPC format)
  if (Array.isArray(payload.sessions)) return payload.sessions;
  // Support direct array (legacy)
  if (Array.isArray(payload)) return payload;
  // Support nested data.sessions
  if (Array.isArray(payload.data?.sessions)) return payload.data.sessions;
  // Support items field
  if (Array.isArray(payload.items)) return payload.items;
  
  // Support new health format grouped by agents
  if (Array.isArray(payload.agents)) {
    const allSessions = [];
    for (const agent of payload.agents) {
      if (agent.sessions && Array.isArray(agent.sessions.recent)) {
        for (const s of agent.sessions.recent) {
          allSessions.push({ ...s, agentId: s.agentId || agent.agentId });
        }
      }
    }
    return allSessions;
  }
  
  return [];
}

export function mapSessionToAgentRow(s: any) {
  const statusRaw = String(s?.status || '').toLowerCase();
  const actif = statusRaw === 'running' || statusRaw === 'active';
  const updated =
    s?.updatedAt != null
      ? Number(s.updatedAt)
      : s?.updated_at
        ? new Date(s.updated_at).getTime()
        : Date.now();
  const name =
    s?.displayName ||
    s?.display_name ||
    s?.agentId ||
    s?.agent_id ||
    s?.sessionKey ||
    s?.session_key ||
    s?.key ||
    'Session';
  return {
    id: String(s?.sessionKey || s?.session_key || s?.key || s?.id || name),
    name: String(name),
    status: actif ? 'actif' : 'en veille',
    model: s?.model != null ? String(s.model) : '—',
    contextTokens:
      typeof s?.contextTokens === 'number'
        ? s.contextTokens
        : typeof s?.context_tokens === 'number'
          ? s.context_tokens
          : null,
    totalTokens: typeof s?.totalTokens === 'number' ? s.totalTokens : (typeof s?.total_tokens === 'number' ? s.total_tokens : 0),
    estimatedCostUsd: typeof s?.estimatedCostUsd === 'number' ? s.estimatedCostUsd : (typeof s?.estimated_cost_usd === 'number' ? s.estimated_cost_usd : 0),
    runtimeMs: typeof s?.runtimeMs === 'number' ? s.runtimeMs : (typeof s?.runtime_ms === 'number' ? s.runtime_ms : 0),
    lastSeenMs: Number.isFinite(updated) ? updated : Date.now(),
    lastSeen: new Date(Number.isFinite(updated) ? updated : Date.now()).toLocaleString('fr-FR'),
    raw: s,
  };
}
