/**
 * Surface HTTP OpenAI-compatible du gateway ZimaOS (/v1/models, /v1/chat/completions).
 * @see https://docs.zimaos.ai/gateway/openai-http-api
 */
import {
  fetchZimaOSJson,
  getGatewayAuthHeaders,
  getZimaOSGatewayBaseUrl,
  getZimaOSToken,
} from './forge-gateway';
import { getOllamaOriginResolved } from './config-db';

export type ZimaOSV1ModelEntry = { id: string; ownedBy?: string };

const V1_MODELS_PATHS = ['/v1/models', '/api/v1/models'] as const;

export async function fetchZimaOSV1Models(
  email: string | undefined,
): Promise<{ ok: boolean; status: number; data: unknown; error?: string }> {
  return fetchZimaOSJson(email, '/v1/models');
}

/** Déplie les réponses gateway du type `{ ok: true, result: … }`. */
function unwrapZimaOSV1Payload(payload: unknown, depth = 0): unknown {
  if (depth > 10 || payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload;
  }
  const o = payload as Record<string, unknown>;
  if (o.ok === true && 'result' in o) {
    return unwrapZimaOSV1Payload(o.result, depth + 1);
  }
  return payload;
}

function findOpenAiModelItemArray(root: unknown): unknown[] | null {
  const unwrapped = unwrapZimaOSV1Payload(root);
  if (unwrapped == null) return null;
  if (Array.isArray(unwrapped)) return unwrapped;
  if (typeof unwrapped === 'string') {
    const t = unwrapped.trim();
    if (t.startsWith('{') || t.startsWith('[')) {
      try {
        return findOpenAiModelItemArray(JSON.parse(t) as unknown);
      } catch {
        return null;
      }
    }
    return null;
  }
  if (typeof unwrapped !== 'object') return null;
  const o = unwrapped as Record<string, unknown>;
  if (Array.isArray(o.data)) return o.data;
  if (Array.isArray(o.models)) return o.models;
  if (Array.isArray(o.items)) return o.items;
  if (o.data != null && typeof o.data === 'object' && !Array.isArray(o.data)) {
    const inner = o.data as Record<string, unknown>;
    if (Array.isArray(inner.data)) return inner.data;
    if (Array.isArray(inner.models)) return inner.models;
    if (Array.isArray(inner.items)) return inner.items;
  }
  if (o.result != null) {
    const nested = findOpenAiModelItemArray(o.result);
    if (nested && nested.length) return nested;
  }
  return null;
}

function entryFromV1Item(item: unknown): ZimaOSV1ModelEntry | null {
  if (typeof item === 'string') {
    const id = item.trim();
    return id ? { id } : null;
  }
  if (item == null || typeof item !== 'object' || Array.isArray(item)) return null;
  const o = item as Record<string, unknown>;
  const id = String(o.id ?? o.model ?? o.name ?? '').trim();
  if (!id) return null;
  const ownedBy =
    o.owned_by != null
      ? String(o.owned_by)
      : o.ownedBy != null
        ? String(o.ownedBy)
        : undefined;
  return { id, ownedBy };
}

export function parseV1ModelList(data: unknown): ZimaOSV1ModelEntry[] {
  const list = findOpenAiModelItemArray(data);
  if (!list || !list.length) return [];
  const out: ZimaOSV1ModelEntry[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const e = entryFromV1Item(item);
    if (!e) continue;
    const k = e.id.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
}

/**
 * Agrège GET /v1/models sur plusieurs chemins possibles (reverse-proxy, anciennes montures).
 */
export async function collectZimaOSV1ModelEntries(
  email: string | undefined,
): Promise<{
  entries: ZimaOSV1ModelEntry[];
  anyHttpOk: boolean;
  lastStatus: number;
  lastError?: string;
  triedPaths: string[];
  lastRaw: unknown;
}> {
  const map = new Map<string, ZimaOSV1ModelEntry>();
  let anyHttpOk = false;
  let lastStatus = 0;
  let lastError: string | undefined;
  let lastRaw: unknown = null;

  const results = await Promise.all(
    V1_MODELS_PATHS.map(path => fetchZimaOSJson(email, path))
  );

  for (const r of results) {
    lastStatus = r.status;
    lastError = r.error;
    lastRaw = r.data;
    if (r.ok) {
      anyHttpOk = true;
      for (const e of parseV1ModelList(r.data)) {
        const k = e.id.toLowerCase();
        if (!map.has(k)) map.set(k, e);
      }
    }
  }

  return {
    entries: [...map.values()],
    anyHttpOk,
    lastStatus,
    lastError: anyHttpOk ? undefined : lastError,
    triedPaths: [...V1_MODELS_PATHS],
    lastRaw,
  };
}

/**
 * Cibles OpenAI `zimaos/…` dérivées du registre agents_list quand /v1/models est vide ou illisible.
 */
export function syntheticZimaOSTargetsFromAgents(
  agents: { id: string }[],
): ZimaOSV1ModelEntry[] {
  const map = new Map<string, ZimaOSV1ModelEntry>();
  const add = (id: string, ownedBy?: string) => {
    const k = id.toLowerCase();
    if (!map.has(k)) map.set(k, { id, ownedBy });
  };
  add('zimaos', 'agents_list');
  add('zimaos/default', 'agents_list');
  for (const a of agents) {
    const id = String(a.id || '').trim();
    if (!id) continue;
    if (/^zimaos\//i.test(id)) {
      add(id, 'agents_list');
    } else {
      add(`zimaos/${id}`, 'agents_list');
    }
  }
  return [...map.values()];
}

/** Cibles `zimaos/<agentId>` dérivées des instructions Forge (grille Paramètres). */
export function syntheticZimaOSTargetsFromForgeAgentIds(
  agentIds: string[],
): ZimaOSV1ModelEntry[] {
  const map = new Map<string, ZimaOSV1ModelEntry>();
  for (const raw of agentIds) {
    const bare = String(raw || '').trim();
    if (!bare) continue;
    const id = /^zimaos\//i.test(bare) ? bare : `zimaos/${bare}`;
    const k = id.toLowerCase();
    if (!map.has(k)) map.set(k, { id, ownedBy: 'forge' });
  }
  return [...map.values()];
}

export function mergeZimaOSV1ModelEntries(
  ...lists: ZimaOSV1ModelEntry[][]
): ZimaOSV1ModelEntry[] {
  const map = new Map<string, ZimaOSV1ModelEntry>();
  for (const list of lists) {
    for (const e of list) {
      const id = String(e.id || '').trim();
      if (!id) continue;
      const k = id.toLowerCase();
      if (!map.has(k)) map.set(k, { id, ownedBy: e.ownedBy });
    }
  }
  return [...map.values()];
}

export async function measureZimaOSHealthRoundTrip(
  email: string | undefined,
): Promise<{ ok: boolean; status: number; latencyMs: number; error?: string }> {
  const t0 = Date.now();
  const r = await fetchZimaOSJson(email, '/health');
  return {
    ok: r.ok,
    status: r.status,
    latencyMs: Date.now() - t0,
    error: r.ok ? undefined : r.error,
  };
}

export type ZimaOSModelPingResult = {
  ok: boolean;
  latencyMs: number;
  status: number;
  preview?: string;
  error?: string;
  /** Ping réussi via `zimaos/default` + `x-zimaos-model` (l’agent `zimaos/<rôle>` est absent du gateway). */
  viaDefaultFallback?: boolean;
  /** Message du premier essai lorsque `viaDefaultFallback` est vrai. */
  primaryAttemptError?: string;
};

async function pingZimaOSChatCompletionOnce(params: {
  base: string;
  token: string;
  openAiModel: string;
  backendModel?: string;
  userMessage?: string;
  maxTokens: number;
}): Promise<ZimaOSModelPingResult> {
  const t0 = Date.now();
  try {
    const res = await fetch(`${params.base}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...getGatewayAuthHeaders(params.token),
        ...(params.backendModel?.trim()
          ? { 'x-zimaos-model': params.backendModel.trim() }
          : {}),
      },
      body: JSON.stringify({
        model: params.openAiModel,
        max_tokens: params.maxTokens,
        messages: [
          {
            role: 'user',
            content: params.userMessage?.trim() || 'Réponds uniquement par le mot PONG.',
          },
        ],
      }),
    });
    const latencyMs = Date.now() - t0;
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    if (!res.ok) {
      const errObj = data as Record<string, unknown>;
      const nested = errObj?.error as Record<string, unknown> | string | undefined;
      const msg =
        (typeof nested === 'object' && nested && nested.message != null
          ? String(nested.message)
          : null) ||
        (typeof nested === 'string' ? nested : null) ||
        (errObj?.message != null ? String(errObj.message) : null) ||
        `HTTP ${res.status}`;
      return { ok: false, latencyMs, status: res.status, error: msg };
    }
    const choices = (data as Record<string, unknown>)?.choices as
      | Record<string, unknown>[]
      | undefined;
    const first = choices?.[0]?.message as Record<string, unknown> | undefined;
    const content = first?.content != null ? String(first.content) : '';
    return { ok: true, latencyMs, status: res.status, preview: content.slice(0, 800) };
  } catch (e: unknown) {
    const latencyMs = Date.now() - t0;
    return {
      ok: false,
      latencyMs,
      status: 0,
      error: e instanceof Error ? e.message : 'Requête échouée',
    };
  }
}

export async function pingZimaOSChatCompletion(opts: {
  openAiModel: string;
  backendModel?: string;
  userMessage?: string;
  maxTokens?: number;
}): Promise<ZimaOSModelPingResult> {
  const token = (await getZimaOSToken()).trim();
  const base = (await getZimaOSGatewayBaseUrl()).replace(/\/$/, '');
  if (!token) {
    return { ok: false, latencyMs: 0, status: 401, error: 'Token ZimaOS manquant.' };
  }
  const maxTok = opts.maxTokens ?? 24;
  const maxTokens = Math.min(Math.max(maxTok, 8), 128);
  const userMessage = opts.userMessage?.trim() || 'Réponds uniquement par le mot PONG.';
  const backend = opts.backendModel?.trim();

  const primary = await pingZimaOSChatCompletionOnce({
    base,
    token,
    openAiModel: opts.openAiModel,
    backendModel: backend,
    userMessage,
    maxTokens,
  });
  if (primary.ok) return primary;

  const m = String(opts.openAiModel || '').trim();
  const afterPrefix = m.replace(/^zimaos\//i, '').toLowerCase();
  const canTryDefault =
    /^zimaos\//i.test(m) &&
    afterPrefix !== '' &&
    afterPrefix !== 'default' &&
    afterPrefix !== 'zimaos' &&
    Boolean(backend);

  if (!canTryDefault) return primary;

  const fallback = await pingZimaOSChatCompletionOnce({
    base,
    token,
    openAiModel: 'zimaos/default',
    backendModel: backend,
    userMessage,
    maxTokens,
  });
  if (!fallback.ok) return primary;

  return {
    ...fallback,
    viaDefaultFallback: true,
    primaryAttemptError: primary.error,
  };
}

/**
 * Liste les tags Ollama en agrégeant toutes les instances configurées dans la DB.
 */
export async function fetchOllamaTagNames(): Promise<{
  configured: boolean;
  names: string[];
  error?: string;
}> {
  const { loadAstroDb } = await import('./load-astro-db');
  const { db, OllamaInstance } = await loadAstroDb();
  
  let instances: { url: string; enabled: number | null }[] = [];
  try {
    if (OllamaInstance) {
      instances = await db.select().from(OllamaInstance);
    }
  } catch {
    // Table non trouvée
  }

  // Fallback sur l'URL globale si aucune instance n'est définie
  if (instances.length === 0) {
    const raw = await getOllamaOriginResolved();
    if (raw) instances.push({ url: raw, enabled: 1 });
  }

  const enabledInstances = instances.filter(i => Number(i.enabled) !== 0);
  if (enabledInstances.length === 0) return { configured: false, names: [] };

  const allNames = new Set<string>();
  let lastError: string | undefined;

  await Promise.all(enabledInstances.map(async (inst) => {
    let base = inst.url.replace(/\/$/, '');
    base = base.replace(/\/v1$/i, '').replace(/\/api$/i, '');
    const url = `${base}/api/tags`;
    
    try {
      const res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json();
        const models = (data as { models?: { name?: string }[] })?.models ?? [];
        models.forEach(m => {
          const name = String(m.name || '').trim();
          if (name) allNames.add(name);
        });
      }
    } catch (e: any) {
      lastError = e.message;
      // Fallback OpenAI /v1/models pour cette instance
      try {
        const v1 = await fetch(`${base}/v1/models`, { method: 'GET', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(3000) });
        if (v1.ok) {
          const payload = await v1.json();
          const data = (payload as { data?: Array<{ id?: string; name?: string }> } | null)?.data ?? [];
          data.forEach(m => {
            const name = String(m.name || m.id || '').trim();
            if (name) allNames.add(name);
          });
        }
      } catch { /* ignore */ }
    }
  }));

  return { 
    configured: true, 
    names: Array.from(allNames), 
    error: allNames.size === 0 ? lastError : undefined 
  };
}
