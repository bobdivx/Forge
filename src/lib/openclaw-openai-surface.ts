/**
 * Surface HTTP OpenAI-compatible du gateway OpenClaw (/v1/models, /v1/chat/completions).
 * @see https://docs.openclaw.ai/gateway/openai-http-api
 */
import {
  fetchOpenClawJson,
  getGatewayAuthHeaders,
  getOpenClawGatewayBaseUrl,
  getOpenClawToken,
} from './openclaw-gateway';
import { getOllamaOriginResolved } from './config-db';

export type OpenClawV1ModelEntry = { id: string; ownedBy?: string };

const V1_MODELS_PATHS = ['/v1/models', '/api/v1/models'] as const;

export async function fetchOpenClawV1Models(
  email: string | undefined,
): Promise<{ ok: boolean; status: number; data: unknown; error?: string }> {
  return fetchOpenClawJson(email, '/v1/models');
}

/** Déplie les réponses gateway du type `{ ok: true, result: … }`. */
function unwrapOpenClawV1Payload(payload: unknown, depth = 0): unknown {
  if (depth > 10 || payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload;
  }
  const o = payload as Record<string, unknown>;
  if (o.ok === true && 'result' in o) {
    return unwrapOpenClawV1Payload(o.result, depth + 1);
  }
  return payload;
}

function findOpenAiModelItemArray(root: unknown): unknown[] | null {
  const unwrapped = unwrapOpenClawV1Payload(root);
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

function entryFromV1Item(item: unknown): OpenClawV1ModelEntry | null {
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

export function parseV1ModelList(data: unknown): OpenClawV1ModelEntry[] {
  const list = findOpenAiModelItemArray(data);
  if (!list || !list.length) return [];
  const out: OpenClawV1ModelEntry[] = [];
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
export async function collectOpenClawV1ModelEntries(
  email: string | undefined,
): Promise<{
  entries: OpenClawV1ModelEntry[];
  anyHttpOk: boolean;
  lastStatus: number;
  lastError?: string;
  triedPaths: string[];
  lastRaw: unknown;
}> {
  const map = new Map<string, OpenClawV1ModelEntry>();
  let anyHttpOk = false;
  let lastStatus = 0;
  let lastError: string | undefined;
  let lastRaw: unknown = null;

  for (const path of V1_MODELS_PATHS) {
    const r = await fetchOpenClawJson(email, path);
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
 * Cibles OpenAI `openclaw/…` dérivées du registre agents_list quand /v1/models est vide ou illisible.
 */
export function syntheticOpenClawTargetsFromAgents(
  agents: { id: string }[],
): OpenClawV1ModelEntry[] {
  const map = new Map<string, OpenClawV1ModelEntry>();
  const add = (id: string, ownedBy?: string) => {
    const k = id.toLowerCase();
    if (!map.has(k)) map.set(k, { id, ownedBy });
  };
  add('openclaw', 'agents_list');
  add('openclaw/default', 'agents_list');
  for (const a of agents) {
    const id = String(a.id || '').trim();
    if (!id) continue;
    if (/^openclaw\//i.test(id)) {
      add(id, 'agents_list');
    } else {
      add(`openclaw/${id}`, 'agents_list');
    }
  }
  return [...map.values()];
}

/** Cibles `openclaw/<agentId>` dérivées des instructions Forge (grille Paramètres). */
export function syntheticOpenClawTargetsFromForgeAgentIds(
  agentIds: string[],
): OpenClawV1ModelEntry[] {
  const map = new Map<string, OpenClawV1ModelEntry>();
  for (const raw of agentIds) {
    const bare = String(raw || '').trim();
    if (!bare) continue;
    const id = /^openclaw\//i.test(bare) ? bare : `openclaw/${bare}`;
    const k = id.toLowerCase();
    if (!map.has(k)) map.set(k, { id, ownedBy: 'forge' });
  }
  return [...map.values()];
}

export function mergeOpenClawV1ModelEntries(
  ...lists: OpenClawV1ModelEntry[][]
): OpenClawV1ModelEntry[] {
  const map = new Map<string, OpenClawV1ModelEntry>();
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

export async function measureOpenClawHealthRoundTrip(
  email: string | undefined,
): Promise<{ ok: boolean; status: number; latencyMs: number; error?: string }> {
  const t0 = Date.now();
  const r = await fetchOpenClawJson(email, '/health');
  return {
    ok: r.ok,
    status: r.status,
    latencyMs: Date.now() - t0,
    error: r.ok ? undefined : r.error,
  };
}

export type OpenClawModelPingResult = {
  ok: boolean;
  latencyMs: number;
  status: number;
  preview?: string;
  error?: string;
  /** Ping réussi via `openclaw/default` + `x-openclaw-model` (l’agent `openclaw/<rôle>` est absent du gateway). */
  viaDefaultFallback?: boolean;
  /** Message du premier essai lorsque `viaDefaultFallback` est vrai. */
  primaryAttemptError?: string;
};

async function pingOpenClawChatCompletionOnce(params: {
  base: string;
  token: string;
  openAiModel: string;
  backendModel?: string;
  userMessage?: string;
  maxTokens: number;
}): Promise<OpenClawModelPingResult> {
  const t0 = Date.now();
  try {
    const res = await fetch(`${params.base}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...getGatewayAuthHeaders(params.token),
        ...(params.backendModel?.trim()
          ? { 'x-openclaw-model': params.backendModel.trim() }
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

export async function pingOpenClawChatCompletion(opts: {
  openAiModel: string;
  backendModel?: string;
  userMessage?: string;
  maxTokens?: number;
}): Promise<OpenClawModelPingResult> {
  const token = (await getOpenClawToken()).trim();
  const base = (await getOpenClawGatewayBaseUrl()).replace(/\/$/, '');
  if (!token) {
    return { ok: false, latencyMs: 0, status: 401, error: 'Token OpenClaw manquant.' };
  }
  const maxTok = opts.maxTokens ?? 24;
  const maxTokens = Math.min(Math.max(maxTok, 8), 128);
  const userMessage = opts.userMessage?.trim() || 'Réponds uniquement par le mot PONG.';
  const backend = opts.backendModel?.trim();

  const primary = await pingOpenClawChatCompletionOnce({
    base,
    token,
    openAiModel: opts.openAiModel,
    backendModel: backend,
    userMessage,
    maxTokens,
  });
  if (primary.ok) return primary;

  const m = String(opts.openAiModel || '').trim();
  const afterPrefix = m.replace(/^openclaw\//i, '').toLowerCase();
  const canTryDefault =
    /^openclaw\//i.test(m) &&
    afterPrefix !== '' &&
    afterPrefix !== 'default' &&
    afterPrefix !== 'openclaw' &&
    Boolean(backend);

  if (!canTryDefault) return primary;

  const fallback = await pingOpenClawChatCompletionOnce({
    base,
    token,
    openAiModel: 'openclaw/default',
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
 * Liste les tags Ollama si une origine est connue : Paramètres (`ollamaUrl`), puis env (optionnel).
 */
export async function fetchOllamaTagNames(): Promise<{
  configured: boolean;
  names: string[];
  error?: string;
}> {
  const raw = await getOllamaOriginResolved();
  if (!raw) return { configured: false, names: [] };
  let base = raw.replace(/\/$/, '');
  // Beaucoup d'instances exposent une URL OpenAI (`.../v1`) dans les paramètres.
  // Pour la surface Ollama native, on doit appeler /api/tags à la racine.
  base = base.replace(/\/v1$/i, '').replace(/\/api$/i, '');
  const url = `${base}/api/tags`;
  try {
    const res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!res.ok) {
      return {
        configured: true,
        names: [],
        error: `Ollama HTTP ${res.status}`,
      };
    }
    const models = (data as { models?: { name?: string }[] })?.models ?? [];
    const names = models.map((m) => String(m.name || '').trim()).filter(Boolean);
    return { configured: true, names };
  } catch (e: unknown) {
    // Fallback utile si l'URL paramétrée expose uniquement l'API OpenAI-compatible.
    try {
      const v1 = await fetch(`${base}/v1/models`, { method: 'GET', headers: { Accept: 'application/json' } });
      const txt = await v1.text();
      let payload: unknown = null;
      try {
        payload = txt ? JSON.parse(txt) : null;
      } catch {
        payload = null;
      }
      if (v1.ok) {
        const data = (payload as { data?: Array<{ id?: string; name?: string }> } | null)?.data ?? [];
        const names = data
          .map((m) => String(m.name || m.id || '').trim())
          .filter(Boolean);
        if (names.length > 0) return { configured: true, names };
      }
    } catch {
      // ignore fallback error, on retourne l'erreur principale
    }
    return { configured: true, names: [], error: e instanceof Error ? e.message : 'Ollama injoignable' };
  }
}
