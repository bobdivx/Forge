/**
 * Appels au gateway OpenClaw.
 * Priorité : variables d’environnement, puis table Config (Astro DB).
 */
import { getConfig } from './config-db';

export async function getOpenClawGatewayBaseUrl(): Promise<string> {
  const env = process.env.OPENCLAW_GATEWAY_URL?.trim();
  if (env) return env.replace(/\/$/, '');
  const fromDb = (await getConfig('openclawGatewayUrl')).trim();
  if (fromDb) return fromDb.replace(/\/$/, '');
  /* Aligné sur les défauts Paramètres / seed (souvent 24190 en self-host). */
  return 'http://127.0.0.1:24190';
}

export async function getOpenClawToken(): Promise<string> {
  const env = process.env.OPENCLAW_GATEWAY_TOKEN?.trim();
  if (env) return env;
  return (await getConfig('openclawToken')).trim();
}

/**
 * Chemins GET possibles (OpenClaw change souvent la surface HTTP).
 * Doc / issues : /api/v1/sessions, /api/v1/status, anciens /api/sessions, etc.
 */
const SESSION_LIST_PATHS = [
  '/api/v1/sessions',
  '/api/v1/status',
  '/api/sessions',
  '/v1/sessions',
  '/sessions',
] as const;

const SESSIONS_LIST_INVOKE_BODY = JSON.stringify({
  tool: 'sessions_list',
  action: 'json',
  args: {},
});

const AGENTS_LIST_INVOKE_BODY = JSON.stringify({
  tool: 'agents_list',
  action: 'json',
  args: {},
});

export type OpenClawSessionFetchAttempt = {
  via: string;
  ok: boolean;
  status: number;
  parsedCount: number;
};

export type OpenClawSessionsPayloadResult = {
  ok: boolean;
  data: unknown;
  error?: string;
  status: number;
  via?: string;
  /** Journal des essais (diagnostic navigateur / API). */
  attempts: OpenClawSessionFetchAttempt[];
};

type BestPayload = { status: number; data: unknown; via: string; count: number };

/**
 * Métadonnées sans secret : ce que le serveur utilise réellement (env > table Config globale).
 * Les réglages OpenClaw sont **instance-wide** (table `Config`), pas par utilisateur.
 */
export async function getOpenClawClientDebugMeta(): Promise<{
  gatewayBaseUrl: string;
  urlSource: 'env' | 'database' | 'default';
  tokenConfigured: boolean;
  tokenSource: 'env' | 'database' | 'none';
  settingsScope: 'instance';
}> {
  const envUrl = process.env.OPENCLAW_GATEWAY_URL?.trim() || '';
  const envTok = process.env.OPENCLAW_GATEWAY_TOKEN?.trim() || '';
  const gatewayBaseUrl = await getOpenClawGatewayBaseUrl();
  const tokenStr = await getOpenClawToken();
  const dbUrl = (await getConfig('openclawGatewayUrl')).trim();

  const urlSource: 'env' | 'database' | 'default' = envUrl
    ? 'env'
    : dbUrl
      ? 'database'
      : 'default';

  const tokenConfigured = Boolean(tokenStr);
  const tokenSource: 'env' | 'database' | 'none' = envTok ? 'env' : tokenStr ? 'database' : 'none';

  return {
    gatewayBaseUrl,
    urlSource,
    tokenConfigured,
    tokenSource,
    settingsScope: 'instance',
  };
}

/**
 * Récupère les sessions : essaie plusieurs GET, garde la réponse qui contient le plus de sessions,
 * puis POST /tools/invoke, puis /health. Évite de s’arrêter sur un GET 200 vide (ex. /api/v1/status).
 */
export async function fetchOpenClawSessionsPayload(
  _email: string | undefined
): Promise<OpenClawSessionsPayloadResult> {
  const attempts: OpenClawSessionFetchAttempt[] = [];
  let best: BestPayload | null = null;
  let lastFail: { status: number; error?: string; data: unknown } = {
    status: 0,
    error: 'OpenClaw : aucune route joignable.',
    data: null,
  };

  const pushAttempt = (via: string, r: Awaited<ReturnType<typeof fetchOpenClawJson>>) => {
    const parsedCount = r.ok ? normalizeOpenClawSessions(r.data).length : 0;
    attempts.push({ via, ok: r.ok, status: r.status, parsedCount });
    if (!r.ok) {
      lastFail = { status: r.status, error: r.error, data: r.data };
      return parsedCount;
    }
    if (!best || parsedCount > best.count) {
      best = { status: r.status, data: r.data, via, count: parsedCount };
    }
    return parsedCount;
  };

  for (const path of SESSION_LIST_PATHS) {
    const r = await fetchOpenClawJson(_email, path);
    const n = pushAttempt(path, r);
    if (r.ok && n > 0) {
      return { ok: true, status: r.status, data: r.data, via: path, attempts };
    }
  }

  const invoke = await fetchOpenClawJson(_email, '/tools/invoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: SESSIONS_LIST_INVOKE_BODY,
  });
  const invokeVia = '/tools/invoke?sessions_list';
  const invokeN = pushAttempt(invokeVia, invoke);
  if (invoke.ok && invokeN > 0) {
    return { ok: true, status: invoke.status, data: invoke.data, via: invokeVia, attempts };
  }

  const health = await fetchOpenClawJson(_email, '/health');
  pushAttempt('/health', health);

  if (best) {
    return { ok: true, status: best.status, data: best.data, via: best.via, attempts };
  }

  return {
    ok: false,
    status: lastFail.status,
    data: lastFail.data,
    error: lastFail.error,
    attempts,
  };
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
  const token = (await getOpenClawToken()).trim();
  const base = await getOpenClawGatewayBaseUrl();
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  const authHeaders = token ? getGatewayAuthHeaders(token) : {};
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...authHeaders,
        ...(init?.headers as Record<string, string>),
      },
    });
    const text = await res.text();
    let data: unknown = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    if (!res.ok) {
      const baseErr =
        (data as Record<string, string>)?.error ||
        (data as Record<string, string>)?.message ||
        `HTTP ${res.status}`;
      const hint401 =
        res.status === 401 && !token
          ? ' — renseignez le token dans Paramètres → Connexion OpenClaw (ou OPENCLAW_GATEWAY_TOKEN).'
          : '';
      return {
        ok: false, status: res.status, data,
        error: `${baseErr}${hint401}`,
      };
    }
    return { ok: true, status: res.status, data };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Gateway injoignable';
    return { ok: false, status: 0, data: null, error: msg };
  }
}

/** Déplie les réponses `{ ok: true, result: … }` (ex. POST /tools/invoke). */
function unwrapOpenClawResult(payload: unknown): unknown {
  let cur: unknown = payload;
  for (let depth = 0; depth < 6; depth++) {
    if (cur == null || typeof cur !== 'object') break;
    const o = cur as Record<string, unknown>;
    if (o.ok === true && 'result' in o) {
      cur = o.result;
      continue;
    }
    break;
  }
  return cur;
}

/**
 * Résultat outil OpenClaw (`jsonResult`) : `{ content: [{ type, text }], details: { count, sessions } }`.
 * Les sessions utiles sont dans `details`, pas à la racine du `result`.
 */
function unwrapToolInvokeEnvelope(payload: unknown): unknown {
  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  const o = payload as Record<string, unknown>;
  if (
    Array.isArray(o.content) &&
    o.details != null &&
    typeof o.details === 'object' &&
    !Array.isArray(o.details)
  ) {
    return o.details;
  }
  return payload;
}

/**
 * Extrait l’objet `details` d’une réponse POST `/tools/invoke` (outil `jsonResult`).
 */
export function extractToolsInvokeDetails(payload: unknown): Record<string, unknown> | null {
  const unwrapped = unwrapOpenClawResult(payload);
  if (unwrapped == null || typeof unwrapped !== 'object' || Array.isArray(unwrapped)) return null;
  const inner = unwrapToolInvokeEnvelope(unwrapped);
  if (inner != null && typeof inner === 'object' && !Array.isArray(inner)) {
    return inner as Record<string, unknown>;
  }
  return null;
}

export type OpenClawRegistryAgent = {
  id: string;
  name?: string;
  configured?: boolean;
};

/**
 * Liste les IDs d’agents visibles côté OpenClaw (outil `agents_list` : config + allowlists subagents).
 */
export async function fetchOpenClawAgentsList(_email: string | undefined): Promise<{
  ok: boolean;
  status: number;
  agents: OpenClawRegistryAgent[];
  requester?: string;
  allowAny?: boolean;
  error?: string;
}> {
  const r = await fetchOpenClawJson(_email, '/tools/invoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: AGENTS_LIST_INVOKE_BODY,
  });
  if (!r.ok) {
    return { ok: false, status: r.status, agents: [], error: r.error };
  }
  const mapRawToAgents = (list: unknown[]): OpenClawRegistryAgent[] => {
    const out: OpenClawRegistryAgent[] = [];
    for (const item of list) {
      if (item == null || typeof item !== 'object' || Array.isArray(item)) continue;
      const o = item as Record<string, unknown>;
      const id = String(o.id ?? '').trim();
      if (!id) continue;
      out.push({
        id,
        name: o.name != null ? String(o.name) : undefined,
        configured: typeof o.configured === 'boolean' ? o.configured : undefined,
      });
    }
    return out;
  };

  let details = extractToolsInvokeDetails(r.data);
  let raw = details && Array.isArray(details.agents) ? details.agents : [];
  let requester = details?.requester != null ? String(details.requester) : undefined;
  let allowAny = typeof details?.allowAny === 'boolean' ? details.allowAny : undefined;

  if (raw.length === 0) {
    const unwrapped = unwrapOpenClawResult(r.data);
    if (unwrapped != null && typeof unwrapped === 'object' && !Array.isArray(unwrapped)) {
      const u = unwrapped as Record<string, unknown>;
      if (Array.isArray(u.content) && u.content.length > 0) {
        const first = u.content[0];
        if (first != null && typeof first === 'object') {
          const text = (first as { text?: unknown }).text;
          if (typeof text === 'string' && text.trim().startsWith('{')) {
            try {
              const parsed = JSON.parse(text) as Record<string, unknown>;
              if (Array.isArray(parsed.agents)) {
                raw = parsed.agents;
                if (parsed.requester != null) requester = String(parsed.requester);
                if (typeof parsed.allowAny === 'boolean') allowAny = parsed.allowAny;
              }
            } catch {
              /* ignore */
            }
          }
        }
      }
    }
  }

  const agents = mapRawToAgents(raw);
  return {
    ok: true,
    status: r.status,
    agents,
    requester,
    allowAny,
  };
}

/** Tente de parser le JSON dans `content[0].text` (même forme que jsonResult côté gateway). */
function tryParseSessionsFromToolText(payload: unknown): unknown[] | null {
  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const o = payload as Record<string, unknown>;
  if (!Array.isArray(o.content) || o.content.length === 0) return null;
  const first = o.content[0];
  if (first == null || typeof first !== 'object') return null;
  const text = (first as { text?: unknown }).text;
  if (typeof text !== 'string' || !text.trim().startsWith('{')) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    const fromParsed = normalizeOpenClawSessions(parsed);
    return fromParsed.length ? fromParsed : null;
  } catch {
    return null;
  }
}

/** Normalise la liste des sessions (plusieurs formes de réponse possibles). */
export function normalizeOpenClawSessions(payload: unknown): unknown[] {
  if (!payload) return [];
  let root = unwrapOpenClawResult(payload);
  root = unwrapToolInvokeEnvelope(root);
  if (Array.isArray(root)) return root as unknown[];

  const p = root as Record<string, unknown>;
  if (p.snapshot && typeof p.snapshot === 'object') {
    return normalizeOpenClawSessions(p.snapshot);
  }
  if (Array.isArray(p.sessions)) return p.sessions;
  if (Array.isArray(p.activeSessions)) return p.activeSessions as unknown[];
  if (Array.isArray(p.recentSessions)) return p.recentSessions as unknown[];
  if (Array.isArray(p.data)) return p.data as unknown[];
  if (Array.isArray((p.data as Record<string, unknown>)?.sessions)) {
    return (p.data as Record<string, unknown[]>).sessions;
  }
  if (Array.isArray(p.items)) return p.items as unknown[];

  const fromText = tryParseSessionsFromToolText(root);
  if (fromText && fromText.length) return fromText;

  if (Array.isArray(p.agents)) {
    const allSessions: unknown[] = [];
    for (const agent of p.agents as Record<string, unknown>[]) {
      const recent = (agent.sessions as Record<string, unknown>)?.recent;
      if (Array.isArray(recent)) {
        for (const s of recent as Record<string, unknown>[]) {
          allSessions.push({ ...s, agentId: s.agentId || agent.agentId });
        }
      }
      const agentSessions = agent.sessions;
      if (Array.isArray(agentSessions)) {
        for (const s of agentSessions as Record<string, unknown>[]) {
          allSessions.push({ ...s, agentId: s.agentId || agent.agentId });
        }
      }
    }
    if (allSessions.length) return allSessions;
  }

  return [];
}

export function mapSessionToAgentRow(s: Record<string, unknown>) {
  const statusRaw = String(s?.status || s?.state || '').toLowerCase();
  const actif =
    statusRaw === 'running' ||
    statusRaw === 'active' ||
    statusRaw === 'connected' ||
    statusRaw === 'online';
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
