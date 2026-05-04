/**
 * Couche HTTP unique vers le gateway ZimaOS (NAS).
 *
 * Ne pas utiliser pour la persistance métier : préférer Astro DB (AgentInstruction, AgentTask,
 * Project, Config…). Ce module sert au runtime distant (sessions, invoke, sync fichier agents).
 *
 * Priorité URL / jeton : variables d’environnement, puis table Config (Astro DB).
 * Audit intégration : Paramètres Forge → onglet ZIMAOS (ou `npm run audit:zimaos` en CI).
 */
import fs from 'node:fs';
import path from 'node:path';
import { discoverZimaosGatewayPublishedPort } from './docker-engine-socket';
import { loadAstroDb } from './load-astro-db';

const GATEWAY_HTTP_TIMEOUT_MS = 1_500;
const ZIMAOS_GATEWAY_INTERNAL_PORT = 18789;
const ZIMAOS_GATEWAY_PUBLISHED_PORT = 24190;

function isRunningInDockerContainer(): boolean {
  return fs.existsSync('/.dockerenv');
}

export type ZimaOSLocalDiskConfig = {
  path: string;
  gatewayPort?: number;
  gatewayToken?: string;
  trustedProxies: string[];
};

export async function readZimaOSLocalConfigFile(): Promise<ZimaOSLocalDiskConfig | null> {
  const { getConfig } = await import('./config-db');
  const { getZimaOSInfraClient } = await import('./forge-infra-client');
  const infra = await getZimaOSInfraClient();
  
  const appDataDir = (await getConfig('dockerAppDataDir')).trim();
  const probePaths = [
    appDataDir ? path.join(appDataDir, 'zimaos', 'zimaos.json') : '',
    'X:/AppData/zimaos/zimaos.json',
    'X:/AppData/zimaos/config/zimaos.json',
    'C:/DATA/AppData/zimaos/zimaos.json',
    '/DATA/AppData/zimaos/zimaos.json',
    '/data/AppData/zimaos/zimaos.json',
  ].filter(Boolean);

  for (const p of probePaths) {
    if (!infra.exists(p)) continue;
    try {
      const raw = infra.readFile(p);
      const parsed = JSON.parse(raw) as Record<string, unknown>;
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

export async function getZimaOSGatewayBaseUrl(): Promise<string> {
  const env =
    process.env.ZIMAOS_GATEWAY_URL?.trim() || process.env.FORGE_ZIMAOS_RUNTIME_URL?.trim();
  if (env) return env.replace(/\/$/, '');
  const { getConfig } = await import('./config-db');
  const fromDb = (await getConfig('zimaosGatewayUrl')).trim();
  if (fromDb) return fromDb.replace(/\/$/, '');
  const fromDbRuntime = (await getConfig('zimaosRuntimeUrl')).trim();
  if (fromDbRuntime) return fromDbRuntime.replace(/\/$/, '');

  let dockerHostPort: number | null = null;
  try {
    dockerHostPort = await discoverZimaosGatewayPublishedPort();
  } catch {
    dockerHostPort = null;
  }
  if (dockerHostPort != null) {
    if (isRunningInDockerContainer()) {
      return `http://host.docker.internal:${dockerHostPort}`;
    }
    return `http://127.0.0.1:${dockerHostPort}`;
  }

  if (isRunningInDockerContainer()) return `http://host.docker.internal:${ZIMAOS_GATEWAY_PUBLISHED_PORT}`;
  const localCfg = await readZimaOSLocalConfigFile();
  if (localCfg?.gatewayPort) return `http://127.0.0.1:${localCfg.gatewayPort}`;
  /*
   * Fallback minimal sans config:
   * - 18789 = port interne gateway ZimaOS (dans zimaos.json)
   * - 24190 = port publie CasaOS/NAS typique (teste via les candidates plus bas)
   */
  return `http://127.0.0.1:${ZIMAOS_GATEWAY_INTERNAL_PORT}`;
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
  const envUrl =
    process.env.ZIMAOS_GATEWAY_URL?.trim() || process.env.FORGE_ZIMAOS_RUNTIME_URL?.trim() || '';
  const dbUrl = (await getConfig('zimaosGatewayUrl')).trim();
  const dbRuntime = (await getConfig('zimaosRuntimeUrl')).trim();
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
  if (dbRuntime) push(dbRuntime);

  let dockerDiscoveredPort: number | null = null;
  try {
    dockerDiscoveredPort = await discoverZimaosGatewayPublishedPort();
  } catch {
    dockerDiscoveredPort = null;
  }
  if (dockerDiscoveredPort != null) {
    if (isRunningInDockerContainer()) {
      push(`http://host.docker.internal:${dockerDiscoveredPort}`);
    }
    push(`http://127.0.0.1:${dockerDiscoveredPort}`);
    push(`http://localhost:${dockerDiscoveredPort}`);
  }

  if (isRunningInDockerContainer()) {
    push(`http://host.docker.internal:${ZIMAOS_GATEWAY_PUBLISHED_PORT}`);
    push(`http://host.docker.internal:${ZIMAOS_GATEWAY_INTERNAL_PORT}`);
  }

  const localCfg = await readZimaOSLocalConfigFile();
  if (localCfg) {
    const p = localCfg.gatewayPort || ZIMAOS_GATEWAY_INTERNAL_PORT;
    push(`http://127.0.0.1:${p}`);
    push(`http://localhost:${p}`);
    if (p !== ZIMAOS_GATEWAY_PUBLISHED_PORT) {
      push(`http://127.0.0.1:${ZIMAOS_GATEWAY_PUBLISHED_PORT}`);
      push(`http://localhost:${ZIMAOS_GATEWAY_PUBLISHED_PORT}`);
    }
    if (p !== ZIMAOS_GATEWAY_INTERNAL_PORT) {
      push(`http://127.0.0.1:${ZIMAOS_GATEWAY_INTERNAL_PORT}`);
      push(`http://localhost:${ZIMAOS_GATEWAY_INTERNAL_PORT}`);
    }
    const hosts = extractIpv4Candidates(localCfg.trustedProxies);
    for (const h of hosts) {
      push(`http://${h}:${p}`);
      push(`http://${h}:${ZIMAOS_GATEWAY_INTERNAL_PORT}`);
      push(`http://${h}:${ZIMAOS_GATEWAY_PUBLISHED_PORT}`);
    }
  } else if (appDataDir) {
    // Garde-fou : dossier configuré mais fichier absent -> on tente quand même les ports usuels.
    push(`http://127.0.0.1:${ZIMAOS_GATEWAY_INTERNAL_PORT}`);
    push(`http://127.0.0.1:${ZIMAOS_GATEWAY_PUBLISHED_PORT}`);
  }

  if (!out.length) {
    push(`http://127.0.0.1:${ZIMAOS_GATEWAY_INTERNAL_PORT}`);
    push(`http://127.0.0.1:${ZIMAOS_GATEWAY_PUBLISHED_PORT}`);
    push(`http://localhost:${ZIMAOS_GATEWAY_INTERNAL_PORT}`);
    push(`http://localhost:${ZIMAOS_GATEWAY_PUBLISHED_PORT}`);
  }

  return out;
}

export async function getZimaOSGatewayCandidateBases(): Promise<string[]> {
  const candidates = await discoverGatewayBaseUrlCandidates();
  return candidates.length ? candidates : [`http://127.0.0.1:${ZIMAOS_GATEWAY_INTERNAL_PORT}`];
}

export async function getZimaOSToken(): Promise<string> {
  const env = process.env.ZIMAOS_GATEWAY_TOKEN?.trim();
  if (env) return env;
  const { getConfig } = await import('./config-db');
  const fromDb = (await getConfig('zimaosToken')).trim();
  if (fromDb) return fromDb;
  const localCfg = await readZimaOSLocalConfigFile();
  if (localCfg?.gatewayToken) return localCfg.gatewayToken;
  return '';
}

/**
 * Chemins GET possibles (ZimaOS change souvent la surface HTTP).
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
export type FetchZimaOSSessionsOptions = {
  sessionsListArgs?: Record<string, unknown>;
  /** Uniquement POST /tools/invoke — utile pour récupérer messages / transcriptions (page Agents). */
  invokeOnly?: boolean;
};

const AGENTS_LIST_INVOKE_BODY = JSON.stringify({
  tool: 'agents_list',
  action: 'json',
  args: {},
});

export type ZimaOSSessionFetchAttempt = {
  via: string;
  ok: boolean;
  status: number;
  parsedCount: number;
};

export type ZimaOSSessionsPayloadResult = {
  ok: boolean;
  data: unknown;
  error?: string;
  status: number;
  via?: string;
  /** Journal des essais (diagnostic navigateur / API). */
  attempts: ZimaOSSessionFetchAttempt[];
};

type BestPayload = { status: number; data: unknown; via: string; count: number };

/**
 * Métadonnées sans secret : ce que le serveur utilise réellement (env > table Config globale).
 * Les réglages ZimaOS sont **instance-wide** (table `Config`), pas par utilisateur.
 */
export async function getZimaOSClientDebugMeta(): Promise<{
  gatewayBaseUrl: string;
  urlSource: 'env' | 'database' | 'default';
  tokenConfigured: boolean;
  tokenSource: 'env' | 'database' | 'none';
  settingsScope: 'instance';
  sshKeyPath: string;
}> {
  const envUrl =
    process.env.ZIMAOS_GATEWAY_URL?.trim() || process.env.FORGE_ZIMAOS_RUNTIME_URL?.trim() || '';
  const envTok = process.env.ZIMAOS_GATEWAY_TOKEN?.trim() || '';
  const gatewayBaseUrl = await getZimaOSGatewayBaseUrl();
  const tokenStr = await getZimaOSToken();
  const { getConfig } = await import('./config-db');
  const dbUrl = (await getConfig('zimaosGatewayUrl')).trim();
  const dbRuntime = (await getConfig('zimaosRuntimeUrl')).trim();
  const sshKeyPath = (await getConfig('zimaosSshKeyPath')).trim();

  const urlSource: 'env' | 'database' | 'default' = envUrl
    ? 'env'
    : dbUrl || dbRuntime
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
    sshKeyPath,
  };
}

/**
 * Récupère les sessions : essaie plusieurs GET, garde la réponse qui contient le plus de sessions,
 * puis POST /tools/invoke, puis /health. Évite de s’arrêter sur un GET 200 vide (ex. /api/v1/status).
 *
 * `options.invokeOnly` + `sessionsListArgs` (ex. messageLimit) : pour la page Agents / stats liées aux messages.
 */
export async function fetchZimaOSSessionsPayload(
  _email: string | undefined,
  options?: FetchZimaOSSessionsOptions,
): Promise<ZimaOSSessionsPayloadResult> {
  const invokeBody = buildSessionsListInvokeBody(options?.sessionsListArgs);
  const invokeVia = '/tools/invoke?sessions_list';

  if (options?.invokeOnly) {
    const attempts: ZimaOSSessionFetchAttempt[] = [];
    const invoke = await fetchZimaOSJson(_email, '/tools/invoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: invokeBody,
    });
    const parsedCount = invoke.ok ? normalizeZimaOSSessions(invoke.data).length : 0;
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

  const attempts: ZimaOSSessionFetchAttempt[] = [];
  let best: BestPayload | null = null;
  let lastFail: { status: number; error?: string; data: unknown } = {
    status: 0,
    error: 'ZimaOS : aucune route joignable.',
    data: null,
  };

  const pushAttempt = (via: string, r: Awaited<ReturnType<typeof fetchZimaOSJson>>) => {
    const parsedCount = r.ok ? normalizeZimaOSSessions(r.data).length : 0;
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
    const r = await fetchZimaOSJson(_email, path);
    const n = pushAttempt(path, r);
    if (r.ok && n > 0) {
      return { ok: true, status: r.status, data: r.data, via: path, attempts };
    }
  }

  const invoke = await fetchZimaOSJson(_email, '/tools/invoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: invokeBody,
  });
  const invokeN = pushAttempt(invokeVia, invoke);
  if (invoke.ok && invokeN > 0) {
    return { ok: true, status: invoke.status, data: invoke.data, via: invokeVia, attempts };
  }

  const health = await fetchZimaOSJson(_email, '/health');
  pushAttempt('/health', health);

  const fallbackBest = best as BestPayload | null;
  if (fallbackBest) {
    return {
      ok: true,
      status: fallbackBest.status,
      data: fallbackBest.data,
      via: fallbackBest.via,
      attempts,
    };
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
export async function probeZimaOSGatewayRepairPair(
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
    const sessions = normalizeZimaOSSessions(data);
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
 * POST /tools/invoke — outil `sessions_send` (même charge utile que /api/forge-directive).
 * `asyncDelivery: false` par défaut : timeout 120 s, sans `args.async` (compat gateway maximale).
 */
export async function invokeZimaOSSessionsSend(params: {
  sessionKey: string;
  message: string;
  timeoutSeconds?: number;
  /** Variante audit Forge : timeout court + args.async (si le mode standard échoue). */
  asyncDelivery?: boolean;
}): Promise<InvokeSessionsSendResult> {
  const token = (await getZimaOSToken()).trim();
  const bases = await getZimaOSGatewayCandidateBases();
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
          ...(token ? getGatewayAuthHeaders(token) : {}),
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
            'Outil sessions_send indisponible via HTTP (souvent bloqué par défaut). Dans la config ZimaOS gateway, ajoutez par exemple : gateway.tools.allow: ["sessions_send"] — voir https://zimaoss.io/docs/gateway/tools-invoke-http-api',
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
export async function invokeZimaOSAgentTask(params: {
  agentId: string;
  message: string;
}): Promise<InvokeAgentTaskResult> {
  const token = (await getZimaOSToken()).trim();
  const bases = await getZimaOSGatewayCandidateBases();

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
          ...(token ? getGatewayAuthHeaders(token) : {}),
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
 * Tente d'abord `zimaos/<agentId>`, puis `zimaos/default` avec header `x-zimaos-model`.
 */
export async function invokeZimaOSV1ChatFallback(params: {
  agentId: string;
  message: string;
}): Promise<InvokeV1ChatFallbackResult> {
  const token = (await getZimaOSToken()).trim();
  const bases = await getZimaOSGatewayCandidateBases();
  const input = String(params.message || '').slice(0, MAX_SESSIONS_SEND_MESSAGE);
  const agentId = String(params.agentId || '').trim();
  const modelTarget = /^zimaos\//i.test(agentId) ? agentId : `zimaos/${agentId}`;

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
          ...(token ? getGatewayAuthHeaders(token) : {}),
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
    const second = await callV1(base, 'zimaos/default', { 'x-zimaos-model': agentId });
    if (second.ok) return { ...second, via: `zimaos/default→${agentId}` };
    lastErr = second.error ? second : first;
  }
  return lastErr;
}

export async function fetchZimaOSJson(
  _email: string | undefined,
  path: string,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; data: unknown; error?: string }> {
  const token = (await getZimaOSToken()).trim();
  const authHeaders = token ? getGatewayAuthHeaders(token) : {};
  const candidates = await getZimaOSGatewayCandidateBases();
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
            ? ' — renseignez le token dans Paramètres → Connexion ZimaOS.'
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
function unwrapZimaOSResult(payload: unknown): unknown {
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
 * Résultat outil ZimaOS (`jsonResult`) : `{ content: [{ type, text }], details: { count, sessions } }`.
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
  const unwrapped = unwrapZimaOSResult(payload);
  if (unwrapped == null || typeof unwrapped !== 'object' || Array.isArray(unwrapped)) return null;
  const inner = unwrapToolInvokeEnvelope(unwrapped);
  if (inner != null && typeof inner === 'object' && !Array.isArray(inner)) {
    return inner as Record<string, unknown>;
  }
  return null;
}

export type ZimaOSRegistryAgent = {
  id: string;
  name?: string;
  configured?: boolean;
};

/**
 * Liste les IDs d’agents visibles côté ZimaOS (outil `agents_list` : config + allowlists subagents).
 */
export async function fetchZimaOSAgentsList(_email: string | undefined): Promise<{
  ok: boolean;
  status: number;
  agents: ZimaOSRegistryAgent[];
  requester?: string;
  allowAny?: boolean;
  error?: string;
}> {
  const r = await fetchZimaOSJson(_email, '/tools/invoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: AGENTS_LIST_INVOKE_BODY,
  });
  if (!r.ok) {
    return { ok: false, status: r.status, agents: [], error: r.error };
  }
  const mapRawToAgents = (list: unknown[]): ZimaOSRegistryAgent[] => {
    const out: ZimaOSRegistryAgent[] = [];
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
    const unwrapped = unwrapZimaOSResult(r.data);
    if (unwrapped != null && typeof unwrapped === 'object' && !Array.isArray(unwrapped)) {
        const o = unwrapped as Record<string, any>;
        if (Array.isArray(o.agents)) raw = o.agents;
    }
  }

  return { ok: true, status: r.status, agents: mapRawToAgents(raw), requester, allowAny };
}

/**
 * Récupère le catalogue complet des modèles configurés dans ZimaOS (Ollama, etc).
 */
export async function fetchZimaOSModelCatalog(_email: string | undefined): Promise<{
    ok: boolean;
    status: number;
    models: { id: string; name: string; ownedBy: string }[];
    error?: string;
}> {
    // On essaie d'appeler l'outil models_list s'il est disponible
    const r = await fetchZimaOSJson(_email, '/tools/invoke', {
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
                    ownedBy: 'zimaos',
                })),
            };
        }
    }

    // Fallback : On essaie /v1/models mais en forçant le format JSON
    const v1Res = await fetchZimaOSJson(_email, '/v1/models', {
        headers: { 'Accept': 'application/json' }
    });
    
    if (v1Res.ok && v1Res.data && typeof v1Res.data === 'object' && Array.isArray((v1Res.data as any).data)) {
        return {
            ok: true,
            status: v1Res.status,
            models: (v1Res.data as any).data.map((m: any) => ({
                id: String(m.id),
                name: String(m.name || m.id),
                ownedBy: String(m.owned_by || 'zimaos'),
            })),
        };
    }

    // Ultime recours : Découverte directe via les instances Ollama configurées
    // Cette partie assure que Forge voit les modèles configurés sur plusieurs machines.
    let instances: any[] = [];
    try {
        const { db, OllamaInstance, eq } = await loadAstroDb();
        instances = await db.select().from(OllamaInstance).where(eq(OllamaInstance.enabled, 1));
    } catch {
        // Fallback hardcodé si la table n'existe pas encore
        instances = [
            { name: 'NAS', url: 'https://ollamanas.briseteia.me', enabled: 1 },
            { name: 'PC', url: 'https://ollama.briseteia.me', enabled: 1 }
        ];
    }
    
    if (instances.length === 0) return { ok: false, status: 404, models: [], error: 'Aucune instance Ollama configurée' };

    const parallelDiscovery = await Promise.all(instances.map(async instance => {
        const url = `${instance.url.replace(/\/$/, '')}/v1/models`;
        try {
            const headers: Record<string, string> = { 'Accept': 'application/json' };
            if (instance.apiKey) {
                headers['Authorization'] = `Bearer ${instance.apiKey}`;
            }
            const resp = await fetch(url, { 
                headers,
                signal: AbortSignal.timeout(5000) 
            });
            if (!resp.ok) return [];
            const json = await resp.json();
            const sourceName = instance.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
            return (json.data || []).map((m: any) => ({
                id: String(m.id),
                name: String(m.name || m.id),
                ownedBy: `ollama-${sourceName}`
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
    const fromParsed = normalizeZimaOSSessions(parsed);
    return fromParsed.length ? fromParsed : null;
  } catch {
    return null;
  }
}

/** Normalise la liste des sessions (plusieurs formes de réponse possibles). */
export function normalizeZimaOSSessions(payload: unknown): unknown[] {
  if (!payload) return [];
  let root = unwrapZimaOSResult(payload);
  root = unwrapToolInvokeEnvelope(root);
  if (Array.isArray(root)) return root as unknown[];

  const p = root as Record<string, unknown>;
  if (p.snapshot && typeof p.snapshot === 'object') {
    return normalizeZimaOSSessions(p.snapshot);
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
export async function probeZimaOSGatewayDraft(
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
    const sessions = normalizeZimaOSSessions(data);
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

  const res = await fetchZimaOSSessionsPayload(email, {
    invokeOnly: true,
    sessionsListArgs: { limit: 100 },
  });
  if (!res.ok) return null;

  const sessions = normalizeZimaOSSessions(res.data) as Record<string, unknown>[];
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
