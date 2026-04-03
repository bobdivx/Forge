/**
 * Appels au gateway OpenClaw.
 * Config : env > table Config > ancien config.json (readAppSettings).
 */
import { getConfig } from './config-db';
import { readAppSettings } from './auth';

export async function getOpenClawGatewayBaseUrl(): Promise<string> {
  const env = process.env.OPENCLAW_GATEWAY_URL?.trim();
  if (env) return env.replace(/\/$/, '');
  const fromDb = (await getConfig('openclawGatewayUrl')).trim();
  if (fromDb) return fromDb.replace(/\/$/, '');
  const legacy = String(readAppSettings()?.openclawGatewayUrl || '').trim();
  if (legacy) return legacy.replace(/\/$/, '');
  // Aligné sur gateway.port dans openclaw.json (souvent 18789) — pas l’UI Control sur 24190.
  return 'http://127.0.0.1:18789';
}

export async function getOpenClawToken(): Promise<string> {
  const env = process.env.OPENCLAW_GATEWAY_TOKEN?.trim();
  if (env) return env;
  const fromDb = (await getConfig('openclawToken')).trim();
  if (fromDb) return fromDb;
  return String(readAppSettings()?.openclawToken || '').trim();
}

/** Chemins HTTP possibles pour la liste des sessions (OpenClaw évolue vite). */
const SESSION_LIST_PATHS = ['/api/sessions', '/v1/sessions', '/sessions'] as const;

/**
 * Récupère le JSON brut des sessions via la même auth que les Paramètres.
 * Préfère /api/sessions (comme la CLI sessions.list), pas /health (souvent sans liste).
 */
export async function fetchOpenClawSessionsPayload(
  email: string | undefined
): Promise<{ ok: boolean; data: unknown; error?: string; status: number; via?: string }> {
  for (const path of SESSION_LIST_PATHS) {
    const result = await fetchOpenClawJson(email, path);
    if (result.ok) return { ...result, via: path };
  }
  const health = await fetchOpenClawJson(email, '/health');
  return { ...health, via: '/health' };
}

export function getGatewayAuthHeaders(token: string): Record<string, string> {
  return {
    'X-Gateway-Token': token,
    Authorization: `Bearer ${token}`,
  };
}

export async function fetchOpenClawJson(
  _email: string | undefined,
  path: string,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; data: unknown; error?: string }> {
  const token = await getOpenClawToken();
  if (!token) {
    return {
      ok: false, status: 401, data: null,
      error: 'Token OpenClaw manquant — configurez-le dans Paramètres → Connexion OpenClaw.',
    };
  }
  const base = await getOpenClawGatewayBaseUrl();
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
    let data: unknown = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    if (!res.ok) {
      return {
        ok: false, status: res.status, data,
        error: (data as Record<string, string>)?.error || (data as Record<string, string>)?.message || `HTTP ${res.status}`,
      };
    }
    return { ok: true, status: res.status, data };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Gateway injoignable';
    return { ok: false, status: 0, data: null, error: msg };
  }
}

/** Normalise la liste des sessions (plusieurs formes de réponse possibles). */
export function normalizeOpenClawSessions(payload: unknown): unknown[] {
  if (!payload) return [];
  const p = payload as Record<string, unknown>;
  if (Array.isArray(p.sessions)) return p.sessions;
  if (Array.isArray(payload)) return payload as unknown[];
  if (Array.isArray((p.data as Record<string, unknown>)?.sessions)) return (p.data as Record<string, unknown[]>).sessions;
  if (Array.isArray(p.items)) return p.items as unknown[];

  if (Array.isArray(p.agents)) {
    const allSessions: unknown[] = [];
    for (const agent of p.agents as Record<string, unknown>[]) {
      const recent = (agent.sessions as Record<string, unknown>)?.recent;
      if (Array.isArray(recent)) {
        for (const s of recent as Record<string, unknown>[]) {
          allSessions.push({ ...s, agentId: s.agentId || agent.agentId });
        }
      }
    }
    return allSessions;
  }
  return [];
}

export function mapSessionToAgentRow(s: Record<string, unknown>) {
  const statusRaw = String(s?.status || '').toLowerCase();
  const actif = statusRaw === 'running' || statusRaw === 'active';
  const updated =
    s?.updatedAt != null ? Number(s.updatedAt) :
    s?.updated_at ? new Date(String(s.updated_at)).getTime() :
    Date.now();
  const name =
    s?.displayName || s?.display_name || s?.agentId || s?.agent_id ||
    s?.sessionKey || s?.session_key || s?.key || 'Session';
  return {
    id: String(s?.sessionKey || s?.session_key || s?.key || s?.id || name),
    name: String(name),
    status: actif ? 'actif' : 'en veille',
    model: s?.model != null ? String(s.model) : '—',
    contextTokens: typeof s?.contextTokens === 'number' ? s.contextTokens : typeof s?.context_tokens === 'number' ? s.context_tokens : null,
    totalTokens: typeof s?.totalTokens === 'number' ? s.totalTokens : typeof s?.total_tokens === 'number' ? s.total_tokens : 0,
    estimatedCostUsd: typeof s?.estimatedCostUsd === 'number' ? s.estimatedCostUsd : typeof s?.estimated_cost_usd === 'number' ? s.estimated_cost_usd : 0,
    runtimeMs: typeof s?.runtimeMs === 'number' ? s.runtimeMs : typeof s?.runtime_ms === 'number' ? s.runtime_ms : 0,
    lastSeenMs: Number.isFinite(updated) ? updated : Date.now(),
    lastSeen: new Date(Number.isFinite(updated) ? updated : Date.now()).toLocaleString('fr-FR'),
    raw: s,
  };
}
