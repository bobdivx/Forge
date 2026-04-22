/**
 * Appels au gateway OpenClaw.
 * Priorité : variables d’environnement, puis table Config (Astro DB).
 */
import fs from 'node:fs';
import path from 'node:path';

const GATEWAY_HTTP_TIMEOUT_MS = 1_500;
const OPENCLAW_GATEWAY_INTERNAL_PORT = 18789;
const OPENCLAW_GATEWAY_PUBLISHED_PORT = 24190;

export type OpenClawLocalDiskConfig = {
  path: string;
  gatewayPort?: number;
  gatewayToken?: string;
  trustedProxies: string[];
};

export async function readOpenClawLocalConfigFile(): Promise<OpenClawLocalDiskConfig | null> {
  const { getConfig } = await import('./config-db');
  const appDataDir = (await getConfig('dockerAppDataDir')).trim();
  const probePaths = [
    appDataDir ? path.join(appDataDir, 'openclaw', 'openclaw.json') : '',
    'X:/AppData/openclaw/openclaw.json',
    'C:/DATA/AppData/openclaw/openclaw.json',
    '/DATA/AppData/openclaw/openclaw.json',
  ].filter(Boolean);

  for (const p of probePaths) {
    if (!fs.existsSync(p)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(p, 'utf-8')) as Record<string, unknown>;
      const gw = (parsed.gateway as Record<string, unknown>) || {};
      const auth = (gw.auth as Record<string, unknown>) || {};
      const port = Number(gw.port);
      const trustedProxies = Array.isArray(gw.trustedProxies)
        ? gw.trustedProxies.map((v) => String(v ?? '')).filter(Boolean)
        : [];
      return {
        path: p,
        gatewayPort: Number.isFinite(port) && port > 0 && port < 65536 ? port : undefined,
        gatewayToken:
          typeof auth.token === 'string' && auth.token.trim() ? auth.token.trim() : undefined,
        trustedProxies,
      };
    } catch {
      /* ignore and try next */
    }
  }
  return null;
}

export async function getOpenClawGatewayBaseUrl(): Promise<string> {
  const env = process.env.OPENCLAW_GATEWAY_URL?.trim();
  if (env) return env.replace(/\/$/, '');
  const { getConfig } = await import('./config-db');
  const fromDb = (await getConfig('openclawGatewayUrl')).trim();
  if (fromDb) return fromDb.replace(/\/$/, '');
  const localCfg = await readOpenClawLocalConfigFile();
  if (localCfg?.gatewayPort) return `http://127.0.0.1:${localCfg.gatewayPort}`;
  /*
   * Fallback minimal sans config:
   * - 18789 = port interne gateway OpenClaw (dans openclaw.json)
   * - 24190 = port publie CasaOS/NAS typique (teste via les candidates plus bas)
   */
  return `http://127.0.0.1:${OPENCLAW_GATEWAY_INTERNAL_PORT}`;
}

function normalizeBaseUrl(raw: string): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  try {
    const u = new URL(s);
    if (!/^https?:$/i.test(u.protocol)) return '';
    return `${u.protocol}//${u.host}`.replace(/\/$/, '');
  } catch {
    return '';
  }
}

function extractIpv4Candidates(values: unknown[]): string[] {
  const out: string[] = [];
  for (const v of values) {
    const s = String(v ?? '').trim();
    if (!s) continue;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) out.push(s);
    const cidr = s.match(/^(\d{1,3}(?:\.\d{1,3}){3})\/\d{1,2}$/);
    if (cidr?.[1]) out.push(cidr[1]);
  }
  return [...new Set(out)];
}

async function discoverGatewayBaseUrlCandidates(): Promise<string[]> {
  const out: string[] = [];
  const push = (u: string) => {
    const n = normalizeBaseUrl(u);
    if (n && !out.includes(n)) out.push(n);
  };

  const { getConfig } = await import('./config-db');
  const envUrl = process.env.OPENCLAW_GATEWAY_URL?.trim() || '';
  const dbUrl = (await getConfig('openclawGatewayUrl')).trim();
  const appDataDir = (await getConfig('dockerAppDataDir')).trim();

  if (envUrl) push(envUrl);
  if (dbUrl) {
    push(dbUrl);
    // Compat historique : plusieurs installs ont migré 24190 -> 18789.
    try {
      const u = new URL(dbUrl);
      if (u.port === '24190') {
        u.port = '18789';
        push(u.toString());
      }
    } catch {
      /* ignore */
    }
  }

  const localCfg = await readOpenClawLocalConfigFile();
  if (localCfg) {
    const p = localCfg.gatewayPort || OPENCLAW_GATEWAY_INTERNAL_PORT;
    push(`http://127.0.0.1:${p}`);
    push(`http://localhost:${p}`);
    if (p !== OPENCLAW_GATEWAY_PUBLISHED_PORT) {
      push(`http://127.0.0.1:${OPENCLAW_GATEWAY_PUBLISHED_PORT}`);
      push(`http://localhost:${OPENCLAW_GATEWAY_PUBLISHED_PORT}`);
    }
    if (p !== OPENCLAW_GATEWAY_INTERNAL_PORT) {
      push(`http://127.0.0.1:${OPENCLAW_GATEWAY_INTERNAL_PORT}`);
      push(`http://localhost:${OPENCLAW_GATEWAY_INTERNAL_PORT}`);
    }
    const hosts = extractIpv4Candidates(localCfg.trustedProxies);
    for (const h of hosts) {
      push(`http://${h}:${p}`);
      push(`http://${h}:${OPENCLAW_GATEWAY_INTERNAL_PORT}`);
      push(`http://${h}:${OPENCLAW_GATEWAY_PUBLISHED_PORT}`);
    }
  } else if (appDataDir) {
    // Garde-fou : dossier configuré mais fichier absent -> on tente quand même les ports usuels.
    push(`http://127.0.0.1:${OPENCLAW_GATEWAY_INTERNAL_PORT}`);
    push(`http://127.0.0.1:${OPENCLAW_GATEWAY_PUBLISHED_PORT}`);
  }

  if (!out.length) {
    push(`http://127.0.0.1:${OPENCLAW_GATEWAY_INTERNAL_PORT}`);
    push(`http://127.0.0.1:${OPENCLAW_GATEWAY_PUBLISHED_PORT}`);
    push(`http://localhost:${OPENCLAW_GATEWAY_INTERNAL_PORT}`);
    push(`http://localhost:${OPENCLAW_GATEWAY_PUBLISHED_PORT}`);
  }

  return out;
}

export async function getOpenClawGatewayCandidateBases(): Promise<string[]> {
  const candidates = await discoverGatewayBaseUrlCandidates();
  return candidates.length ? candidates : [`http://127.0.0.1:${OPENCLAW_GATEWAY_INTERNAL_PORT}`];
}

export async function getOpenClawToken(): Promise<string> {
  const env = process.env.OPENCLAW_GATEWAY_TOKEN?.trim();
  if (env) return env;
  const { getConfig } = await import('./config-db');
  const fromDb = (await getConfig('openclawToken')).trim();
  if (fromDb) return fromDb;
  const localCfg = await readOpenClawLocalConfigFile();
  if (localCfg?.gatewayToken) return localCfg.gatewayToken;
  /* Aligné sur le défaut CasaOS/OpenClaw sur ZimaOS */
  return 'casaos';
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
  '/api/models',
  '/api/tags',
  '/v1/models',
] as const;

export function buildSessionsListInvokeBody(args?: Record<string, unknown>): string {
  return JSON.stringify({
    tool: 'sessions_list',
    action: 'json',
    args: args && typeof args === 'object' ? args : {},
  });
}

/** Options pour enrichir sessions_list (ex. messageLimit) ou forcer l’invoke HTTP. */
export type FetchOpenClawSessionsOptions = {
  sessionsListArgs?: Record<string, unknown>;
  /** Uniquement POST /tools/invoke — utile pour récupérer messages / transcriptions (page Agents). */
  invokeOnly?: boolean;
};

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
  const { getConfig } = await import('./config-db');
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
 *
 * `options.invokeOnly` + `sessionsListArgs` (ex. messageLimit) : pour la page Agents / stats liées aux messages.
 */
export async function fetchOpenClawSessionsPayload(
  _email: string | undefined,
  options?: FetchOpenClawSessionsOptions,
): Promise<OpenClawSessionsPayloadResult> {
  const invokeBody = buildSessionsListInvokeBody(options?.sessionsListArgs);
  const invokeVia = '/tools/invoke?sessions_list';

  if (options?.invokeOnly) {
    const attempts: OpenClawSessionFetchAttempt[] = [];
    const invoke = await fetchOpenClawJson(_email, '/tools/invoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: invokeBody,
    });
    const parsedCount = invoke.ok ? normalizeOpenClawSessions(invoke.data).length : 0;
    attempts.push({ via: invokeVia, ok: invoke.ok, status: invoke.status, parsedCount });
    if (invoke.ok && parsedCount > 0) {
      return { ok: true, status: invoke.status, data: invoke.data, via: invokeVia, attempts };
    }
    return {
      ok: false,
      status: invoke.status,
      data: invoke.data,
      error: invoke.error || 'sessions_list (invokeOnly) vide ou refusé',
      attempts,
    };
  }

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
    body: invokeBody,
  });
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
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/json',
  };
}

/**
 * Sonde une paire URL + jeton (diagnostic / réparation) : GET /health puis POST /tools/invoke (sessions_list).
 * Ne lit pas la table Config : sert à tester des combinaisons avant écriture.
 */
export async function probeOpenClawGatewayRepairPair(
  gatewayBaseUrl: string,
  token: string,
): Promise<{
  ok: boolean;
  healthOk: boolean;
  invokeOk: boolean;
  sessionCount: number;
  error?: string;
}> {
  const base = String(gatewayBaseUrl || '').trim().replace(/\/$/, '');
  const tok = String(token || '').trim();
  if (!base || !/^https?:\/\//i.test(base)) {
    return {
      ok: false,
      healthOk: false,
      invokeOk: false,
      sessionCount: 0,
      error: 'URL invalide (http ou https requis).',
    };
  }
  const signal = () => AbortSignal.timeout(GATEWAY_HTTP_TIMEOUT_MS);
  let healthOk = false;
  try {
    const healthRes = await fetch(`${base}/health`, {
      method: 'GET',
      headers: { Accept: 'application/json', ...(tok ? getGatewayAuthHeaders(tok) : {}) },
      signal: signal(),
    });
    healthOk = healthRes.ok;
    if (!healthOk) {
      return {
        ok: false,
        healthOk: false,
        invokeOk: false,
        sessionCount: 0,
        error: `HTTP ${healthRes.status} sur /health`,
      };
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur réseau';
    return { ok: false, healthOk: false, invokeOk: false, sessionCount: 0, error: msg };
  }

  const invokeBody = buildSessionsListInvokeBody({ limit: 12, messageLimit: 0 });
  try {
    const res = await fetch(`${base}/tools/invoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(tok ? getGatewayAuthHeaders(tok) : {}),
      },
      body: invokeBody,
      signal: signal(),
    });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    if (!res.ok) {
      const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
      const nested = d.error && typeof d.error === 'object' ? (d.error as { message?: string }).message : '';
      const err =
        (typeof d.error === 'string' ? d.error : '') ||
        (typeof nested === 'string' ? nested : '') ||
        (typeof d.message === 'string' ? d.message : '') ||
        `HTTP ${res.status}`;
      return { ok: false, healthOk: true, invokeOk: false, sessionCount: 0, error: err };
    }
    const sessions = normalizeOpenClawSessions(data);
    return { ok: true, healthOk: true, invokeOk: true, sessionCount: sessions.length };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur réseau';
    return { ok: false, healthOk: true, invokeOk: false, sessionCount: 0, error: msg };
  }
}

const MAX_SESSIONS_SEND_MESSAGE = 120_000;

export type InvokeSessionsSendResult = {
  ok: boolean;
  error?: string;
  detail?: unknown;
  httpStatus?: number;
};

export type InvokeAgentTaskResult = {
  ok: boolean;
  error?: string;
  detail?: unknown;
  httpStatus?: number;
};

export type InvokeV1ChatFallbackResult = {
  ok: boolean;
  error?: string;
  detail?: unknown;
  httpStatus?: number;
  via?: string;
};

/**
 * POST /tools/invoke — outil `sessions_send` (même charge utile que /api/openclaw-directive).
 * `asyncDelivery: false` par défaut : timeout 120 s, sans `args.async` (compat gateway maximale).
 */
export async function invokeOpenClawSessionsSend(params: {
  sessionKey: string;
  message: string;
  timeoutSeconds?: number;
  /** Variante audit Forge : timeout court + args.async (si le mode standard échoue). */
  asyncDelivery?: boolean;
}): Promise<InvokeSessionsSendResult> {
  const token = (await getOpenClawToken()).trim();
  if (!token) {
    return { ok: false, error: 'Token OpenClaw manquant (OPENCLAW_GATEWAY_TOKEN ou table Config).' };
  }
  const bases = await getOpenClawGatewayCandidateBases();
  const message = params.message.slice(0, MAX_SESSIONS_SEND_MESSAGE);

  let args: Record<string, unknown>;
  if (params.asyncDelivery) {
    args = {
      sessionKey: params.sessionKey,
      message,
      timeoutSeconds: 30,
      async: true,
    };
  } else {
    const ts =
      typeof params.timeoutSeconds === 'number' &&
      params.timeoutSeconds >= 0 &&
      params.timeoutSeconds <= 600
        ? Math.floor(params.timeoutSeconds)
        : 120;
    args = { sessionKey: params.sessionKey, message, timeoutSeconds: ts };
  }

  let lastErr: InvokeSessionsSendResult = { ok: false, error: 'Gateway injoignable' };
  for (const base of bases) {
    const url = `${base.replace(/\/$/, '')}/tools/invoke`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...getGatewayAuthHeaders(token),
        },
        body: JSON.stringify({
          tool: 'sessions_send',
          action: 'json',
          args,
          sessionKey: params.sessionKey,
          dryRun: false,
        }),
      });

      const text = await res.text();
      let data: Record<string, unknown> = {};
      try {
        data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
      } catch {
        data = { raw: text };
      }

      if (res.status === 404) {
        lastErr = {
          ok: false,
          httpStatus: 404,
          error:
            'Outil sessions_send indisponible via HTTP (souvent bloqué par défaut). Dans la config OpenClaw gateway, ajoutez par exemple : gateway.tools.allow: ["sessions_send"] — voir https://openclaws.io/docs/gateway/tools-invoke-http-api',
          detail: data,
        };
        continue;
      }

      if (!res.ok) {
        const errMsg =
          (data.error as { message?: string } | undefined)?.message ||
          (typeof data.error === 'string' ? data.error : '') ||
          (typeof data.message === 'string' ? data.message : '') ||
          (typeof data.raw === 'string' ? String(data.raw).slice(0, 600) : '') ||
          `Gateway HTTP ${res.status}`;
        lastErr = { ok: false, httpStatus: res.status, error: `${errMsg} (url=${base})`, detail: data };
        continue;
      }

      if (data.ok === false) {
        const errMsg =
          (data.error as { message?: string } | undefined)?.message ||
          (typeof data.error === 'string' ? data.error : '') ||
          (typeof data.message === 'string' ? data.message : '') ||
          'Gateway a refusé la directive';
        lastErr = { ok: false, httpStatus: 400, error: `${errMsg} (url=${base})`, detail: data };
        continue;
      }

      return { ok: true, detail: data };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erreur réseau';
      lastErr = { ok: false, error: `${msg} (url=${base})` };
    }
  }
  return lastErr;
}

/**
 * Fallback quand `sessions_send` est bloqué : délègue au tool `agents_invoke`.
 * Ici `agentId` est généralement l'id canonique Forge (DEV_FRONTEND, etc.).
 */
export async function invokeOpenClawAgentTask(params: {
  agentId: string;
  message: string;
}): Promise<InvokeAgentTaskResult> {
  const token = (await getOpenClawToken()).trim();
  if (!token) {
    return { ok: false, error: 'Token OpenClaw manquant (OPENCLAW_GATEWAY_TOKEN ou table Config).' };
  }
  const bases = await getOpenClawGatewayCandidateBases();

  const agentId = String(params.agentId || '').trim();
  if (!agentId) return { ok: false, error: 'agentId requis' };
  const message = String(params.message || '').slice(0, MAX_SESSIONS_SEND_MESSAGE);

  let lastErr: InvokeAgentTaskResult = { ok: false, error: 'Gateway injoignable' };
  for (const base of bases) {
    const url = `${base.replace(/\/$/, '')}/tools/invoke`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...getGatewayAuthHeaders(token),
        },
        body: JSON.stringify({
          tool: 'agents_invoke',
          action: 'json',
          args: {
            agentId,
            input: message,
          },
        }),
      });

    const text = await res.text();
    let data: Record<string, unknown> = {};
    try {
      data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      data = { raw: text };
    }

      if (!res.ok) {
      const errMsg =
        (data.error as { message?: string } | undefined)?.message ||
        (typeof data.error === 'string' ? data.error : '') ||
        (typeof data.message === 'string' ? data.message : '') ||
        `Gateway HTTP ${res.status}`;
        lastErr = { ok: false, httpStatus: res.status, error: `${errMsg} (url=${base})`, detail: data };
        continue;
      }

      if (data.ok === false) {
      const errMsg =
        (data.error as { message?: string } | undefined)?.message ||
        (typeof data.error === 'string' ? data.error : '') ||
        (typeof data.message === 'string' ? data.message : '') ||
        'agents_invoke refusé';
        lastErr = { ok: false, httpStatus: 400, error: `${errMsg} (url=${base})`, detail: data };
        continue;
      }

      return { ok: true, detail: data };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erreur réseau';
      lastErr = { ok: false, error: `${msg} (url=${base})` };
    }
  }
  return lastErr;
}

/**
 * Dernier fallback sans tool invoke : POST /v1/chat/completions.
 * Tente d'abord `openclaw/<agentId>`, puis `openclaw/default` avec header `x-openclaw-model`.
 */
export async function invokeOpenClawV1ChatFallback(params: {
  agentId: string;
  message: string;
}): Promise<InvokeV1ChatFallbackResult> {
  const token = (await getOpenClawToken()).trim();
  if (!token) {
    return { ok: false, error: 'Token OpenClaw manquant (OPENCLAW_GATEWAY_TOKEN ou table Config).' };
  }
  const bases = await getOpenClawGatewayCandidateBases();
  const input = String(params.message || '').slice(0, MAX_SESSIONS_SEND_MESSAGE);
  const agentId = String(params.agentId || '').trim();
  const modelTarget = /^openclaw\//i.test(agentId) ? agentId : `openclaw/${agentId}`;

  const callV1 = async (
    baseUrl: string,
    model: string,
    extraHeaders?: Record<string, string>,
  ): Promise<InvokeV1ChatFallbackResult> => {
    const url = `${baseUrl.replace(/\/$/, '')}/v1/chat/completions`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...getGatewayAuthHeaders(token),
          ...(extraHeaders || {}),
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: input }],
          stream: false,
          temperature: 0.2,
          max_tokens: 512,
        }),
      });

      const text = await res.text();
      let data: Record<string, unknown> = {};
      try {
        data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
      } catch {
        data = { raw: text };
      }

      if (!res.ok) {
        const errMsg =
          (data.error as { message?: string } | undefined)?.message ||
          (typeof data.error === 'string' ? data.error : '') ||
          (typeof data.message === 'string' ? data.message : '') ||
          `Gateway HTTP ${res.status}`;
        return { ok: false, httpStatus: res.status, error: `${errMsg} (url=${baseUrl})`, detail: data };
      }

      return { ok: true, detail: data, via: model };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erreur réseau';
      return { ok: false, error: `${msg} (url=${baseUrl})` };
    }
  };

  let lastErr: InvokeV1ChatFallbackResult = { ok: false, error: 'Gateway injoignable' };
  for (const base of bases) {
    const first = await callV1(base, modelTarget);
    if (first.ok) return first;
    const second = await callV1(base, 'openclaw/default', { 'x-openclaw-model': agentId });
    if (second.ok) return { ...second, via: `openclaw/default→${agentId}` };
    lastErr = second.error ? second : first;
  }
  return lastErr;
}

export async function fetchOpenClawJson(
  _email: string | undefined,
  path: string,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; data: unknown; error?: string }> {
  const token = (await getOpenClawToken()).trim();
  const authHeaders = token ? getGatewayAuthHeaders(token) : {};
  const candidates = await getOpenClawGatewayCandidateBases();
  let last: { ok: boolean; status: number; data: unknown; error?: string } = {
    ok: false,
    status: 0,
    data: null,
    error: 'Gateway injoignable',
  };

  for (const base of candidates) {
    const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
    try {
      const res = await fetch(url, {
        ...init,
        signal: init?.signal ?? AbortSignal.timeout(GATEWAY_HTTP_TIMEOUT_MS),
        headers: {
          'Accept': 'application/json',
          ...authHeaders,
          ...(init?.headers as Record<string, string>),
        },
      });

      const contentType = res.headers.get('content-type') || '';
      const text = await res.text();
      let data: unknown = null;
      let isJson = false;

      if (contentType.includes('application/json')) {
        try {
          data = JSON.parse(text);
          isJson = true;
        } catch {
          data = { raw: text };
        }
      } else {
        data = { raw: text };
      }

      if (!res.ok || !isJson) {
        const d = data as Record<string, unknown>;
        const rawErr = d?.error ?? d?.message ?? d?.detail ?? null;
        let baseErr =
          typeof rawErr === 'string'
            ? rawErr
            : rawErr != null && typeof rawErr === 'object'
              ? ((rawErr as Record<string, unknown>).message != null
                  ? String((rawErr as Record<string, unknown>).message)
                  : JSON.stringify(rawErr))
              : `HTTP ${res.status}`;

        if (!isJson && text.trim().startsWith('{')) {
          try {
            data = JSON.parse(text);
            return { ok: true, status: res.status, data };
          } catch {
            /* ignore */
          }
        }

        if (!isJson && res.ok) {
          baseErr = `Réponse non-JSON (${contentType || 'inconnu'}) sur port ${new URL(url).port || '80'}.`;
        }

        const hint401 =
          res.status === 401 && !token
            ? ' — renseignez le token dans Paramètres → Connexion OpenClaw.'
            : '';

        last = {
          ok: false,
          status: res.status,
          data,
          error: `${baseErr}${hint401} (url=${base})`,
        };
        // 401/403 => URL probablement correcte, inutile d'essayer d'autres hôtes.
        if (res.status === 401 || res.status === 403) return last;
        continue;
      }
      return { ok: true, status: res.status, data };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Gateway injoignable';
      last = { ok: false, status: 0, data: null, error: `${msg} (url=${base})` };
    }
  }

  return last;
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
      const id = String(
        o.id ?? o.agentId ?? o.agent_id ?? o.key ?? o.slug ?? o.name ?? '',
      ).trim();
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
        const o = unwrapped as Record<string, any>;
        if (Array.isArray(o.agents)) raw = o.agents;
    }
  }

  return { ok: true, status: r.status, agents: mapRawToAgents(raw), requester, allowAny };
}

/**
 * Récupère le catalogue complet des modèles configurés dans OpenClaw (Ollama, etc).
 */
export async function fetchOpenClawModelCatalog(_email: string | undefined): Promise<{
    ok: boolean;
    status: number;
    models: { id: string; name: string; ownedBy: string }[];
    error?: string;
}> {
    // On essaie d'appeler l'outil models_list s'il est disponible
    const r = await fetchOpenClawJson(_email, '/tools/invoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: 'models_list', action: 'json', args: {} }),
    });

    if (r.ok) {
        const details = extractToolsInvokeDetails(r.data);
        const list = (details?.models as any[]) || [];
        if (list.length > 0) {
            return {
                ok: true,
                status: r.status,
                models: list.map(m => ({
                    id: String(m.id || m.modelId || m.key),
                    name: String(m.name || m.displayName || m.id),
                    ownedBy: 'openclaw',
                })),
            };
        }
    }

    // Fallback : On essaie /v1/models mais en forçant le format JSON
    const v1Res = await fetchOpenClawJson(_email, '/v1/models', {
        headers: { 'Accept': 'application/json' }
    });
    
    if (v1Res.ok && v1Res.data && typeof v1Res.data === 'object' && Array.isArray((v1Res.data as any).data)) {
        return {
            ok: true,
            status: v1Res.status,
            models: (v1Res.data as any).data.map((m: any) => ({
                id: String(m.id),
                name: String(m.name || m.id),
                ownedBy: String(m.owned_by || 'openclaw'),
            })),
        };
    }

    // Ultime recours : Découverte directe des providers connus (NAS & Windows)
    // Cette partie assure que même si la gateway masque le catalogue, Forge voit les modèles configurés.
    const providers = [
        'https://ollamanas.briseteia.me/v1/models',
        'https://ollama.briseteia.me/v1/models'
    ];
    
    const parallelDiscovery = await Promise.all(providers.map(async url => {
        try {
            const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
            if (!resp.ok) return [];
            const json = await resp.json();
            return (json.data || []).map((m: any) => ({
                id: String(m.id),
                name: String(m.name || m.id),
                ownedBy: url.includes('nas') ? 'ollama-nas' : 'ollama-windows'
            }));
        } catch { return []; }
    }));

    const directModels = parallelDiscovery.flat();
    if (directModels.length > 0) {
        return { ok: true, status: 200, models: directModels };
    }

    return { ok: false, status: r.status, models: [], error: 'Catalogue indisponible' };
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

/**
 * Teste un gateway avec URL + jeton fournis (assistant setup / formulaire),
 * sans lire la table Config (évite d’avoir à sauvegarder avant de tester).
 */
export async function probeOpenClawGatewayDraft(
  gatewayBaseUrl: string,
  token: string,
): Promise<{ reachable: boolean; status: number; sessionCount: number; error?: string }> {
  const base = String(gatewayBaseUrl || '').trim().replace(/\/$/, '');
  const tok = String(token || '').trim();
  if (!base || !/^https?:\/\//i.test(base)) {
    return {
      reachable: false,
      status: 400,
      sessionCount: 0,
      error: 'URL invalide (http ou https requis).',
    };
  }
  const invokeBody = buildSessionsListInvokeBody({ limit: 12, messageLimit: 0 });
  const url = `${base}/tools/invoke`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(tok ? getGatewayAuthHeaders(tok) : {}),
      },
      body: invokeBody,
      signal: AbortSignal.timeout(GATEWAY_HTTP_TIMEOUT_MS),
    });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    if (!res.ok) {
      const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
      const nested = d.error && typeof d.error === 'object' ? (d.error as { message?: string }).message : '';
      const err =
        (typeof d.error === 'string' ? d.error : '') ||
        (typeof nested === 'string' ? nested : '') ||
        (typeof d.message === 'string' ? d.message : '') ||
        `HTTP ${res.status}`;
      return { reachable: false, status: res.status, sessionCount: 0, error: err };
    }
    const sessions = normalizeOpenClawSessions(data);
    return { reachable: true, status: res.status, sessionCount: sessions.length };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Gateway injoignable';
    return { reachable: false, status: 0, sessionCount: 0, error: msg };
  }
}

/**
 * Clé à passer à `sessions_send` (souvent `telegram:…` / `sessionKey`), pas seulement l’id métier URL.
 * Compare chaque indice aux sessions listées par le gateway.
 */
export async function resolveSessionsSendKey(
  email: string | undefined,
  hints: string[],
): Promise<string | null> {
  const unique = [...new Set(hints.map((h) => String(h || '').trim()).filter(Boolean))];
  if (!unique.length) return null;

  const res = await fetchOpenClawSessionsPayload(email, {
    invokeOnly: true,
    sessionsListArgs: { limit: 100 },
  });
  if (!res.ok) return null;

  const sessions = normalizeOpenClawSessions(res.data) as Record<string, unknown>[];
  for (const hint of unique) {
    const want = hint.toUpperCase();
    const session = sessions.find((s) => {
      const keys = [s.sessionKey, s.key, s.id, s.agentId, s.agent_id].map((x) =>
        String(x ?? '').toUpperCase(),
      );
      return keys.some((k) => k && (k === want || k.includes(want)));
    });
    if (session) return mapSessionToAgentRow(session).id;
  }
  return null;
}
