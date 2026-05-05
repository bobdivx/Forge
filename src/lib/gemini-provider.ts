/**
 * Provider LLM Google Gemini.
 *
 * Utilise l'endpoint OpenAI-compatible exposé par Google AI :
 *   POST https://generativelanguage.googleapis.com/v1beta/openai/chat/completions
 *   GET  https://generativelanguage.googleapis.com/v1beta/openai/models
 *
 * Bénéfice : on garde le même format de messages / outils (`tools` + `tool_calls`)
 * que côté Ollama, ce qui simplifie l'orchestrateur Forge.
 */
import { getAllConfig, getConfig } from './config-db';
import { isGeminiModelId, normalizeGeminiModelId } from './gemini-model-defaults';

export type GeminiChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: GeminiToolCall[];
  tool_call_id?: string;
};

export type GeminiToolCall = {
  id?: string;
  type?: 'function';
  function?: {
    name?: string;
    arguments?: unknown;
  };
};

export type GeminiToolSchema = {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
};

export type GeminiChatResult = {
  ok: boolean;
  status: number;
  /** Réponse textuelle (assistant.content). */
  content: string;
  /** Tool calls renvoyés par le modèle (format OpenAI). */
  toolCalls: GeminiToolCall[];
  /** Métriques tokens (si fournies). */
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  error?: string;
  /** Réponse brute pour le debug. */
  raw?: unknown;
};

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';

function normalizeBaseUrl(raw: string): string {
  const v = String(raw || '').trim();
  if (!v) return DEFAULT_BASE_URL;
  return v.replace(/\/+$/, '');
}

/** Lit la configuration Gemini depuis la DB (clé API + URL + activation). */
export async function getGeminiConfig(): Promise<{
  apiKey: string;
  baseUrl: string;
  enabled: boolean;
}> {
  const cfg = await getAllConfig();
  return {
    apiKey: String(cfg.geminiApiKey || '').trim(),
    baseUrl: normalizeBaseUrl(cfg.geminiBaseUrl),
    enabled: String(cfg.geminiEnabled || '').toLowerCase() === 'true',
  };
}

/** True si Gemini est activé ET qu'une clé est définie. */
export async function isGeminiAvailable(): Promise<boolean> {
  const c = await getGeminiConfig();
  return c.enabled && c.apiKey.length > 0;
}

export { isGeminiModelId, normalizeGeminiModelId };

/**
 * Cache mémoire des modèles découverts pour éviter d'appeler `/models`
 * à chaque requête `/api/models` ou démarrage d'orchestrateur.
 *
 * Clé = `apiKey|baseUrl` (la clé API change → invalidation naturelle).
 * TTL volontairement court (5 min) pour refléter les nouveaux modèles
 * publiés par Google sans imposer de redémarrage.
 */
type GeminiModelCacheEntry = {
  expiresAt: number;
  models: { id: string; label: string }[];
};
const MODELS_CACHE_TTL_MS = 5 * 60 * 1000;
const modelsCache = new Map<string, GeminiModelCacheEntry>();

/** Invalide le cache modèles (utile après changement de clé API). */
export function invalidateGeminiModelsCache(): void {
  modelsCache.clear();
}

/**
 * Liste les modèles Gemini accessibles avec la clé configurée.
 *
 * 100 % dynamique : aucune liste codée en dur. En cas d'échec ou d'absence
 * de clé, on renvoie un tableau vide avec `ok: false` et un message d'erreur.
 *
 * @param opts.force - bypass le cache mémoire (TTL 5 min sinon).
 */
export async function fetchGeminiAvailableModels(opts?: {
  apiKey?: string;
  baseUrl?: string;
  force?: boolean;
}): Promise<{
  ok: boolean;
  status: number;
  models: { id: string; label: string }[];
  cached?: boolean;
  error?: string;
}> {
  const apiKey = (opts?.apiKey ?? (await getConfig('geminiApiKey'))).trim();
  const baseUrl = normalizeBaseUrl(opts?.baseUrl ?? (await getConfig('geminiBaseUrl')));

  if (!apiKey) {
    return { ok: false, status: 401, models: [], error: 'Clé API Gemini absente.' };
  }

  const cacheKey = `${apiKey}|${baseUrl}`;
  if (!opts?.force) {
    const cached = modelsCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return { ok: true, status: 200, models: cached.models, cached: true };
    }
  }

  try {
    const res = await fetch(`${baseUrl}/models`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(8_000),
    });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    if (!res.ok) {
      const errMessage = extractGeminiErrorMessage(data) || `HTTP ${res.status}`;
      return { ok: false, status: res.status, models: [], error: errMessage };
    }

    const list = Array.isArray((data as Record<string, unknown> | null)?.data)
      ? ((data as Record<string, unknown>).data as Array<Record<string, unknown>>)
      : [];

    const seen = new Set<string>();
    const models: { id: string; label: string }[] = [];
    for (const item of list) {
      const rawId = String(item.id || '').trim();
      if (!rawId) continue;
      const id = normalizeGeminiModelId(rawId);
      if (!isGeminiModelId(id)) continue;
      const k = id.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      models.push({ id, label: id });
    }

    modelsCache.set(cacheKey, {
      expiresAt: Date.now() + MODELS_CACHE_TTL_MS,
      models,
    });

    return { ok: true, status: res.status, models };
  } catch (e: unknown) {
    return {
      ok: false,
      status: 0,
      models: [],
      error: e instanceof Error ? e.message : 'Requête Gemini échouée.',
    };
  }
}

/**
 * Envoie un message au modèle Gemini et renvoie la réponse normalisée.
 */
export async function geminiChat(opts: {
  model: string;
  messages: GeminiChatMessage[];
  tools?: GeminiToolSchema[];
  apiKey?: string;
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}): Promise<GeminiChatResult> {
  const apiKey = (opts.apiKey ?? (await getConfig('geminiApiKey'))).trim();
  const baseUrl = normalizeBaseUrl(opts.baseUrl ?? (await getConfig('geminiBaseUrl')));
  const timeoutMs = opts.timeoutMs ?? 90_000;

  if (!apiKey) {
    return {
      ok: false,
      status: 401,
      content: '',
      toolCalls: [],
      error: 'Clé API Gemini absente.',
    };
  }

  const model = normalizeGeminiModelId(opts.model);

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: opts.messages,
        ...(opts.tools && opts.tools.length > 0 ? { tools: opts.tools } : {}),
        ...(opts.maxTokens != null ? { max_tokens: opts.maxTokens } : {}),
        ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    if (!res.ok) {
      const errMessage = extractGeminiErrorMessage(data) || `HTTP ${res.status}`;
      return {
        ok: false,
        status: res.status,
        content: '',
        toolCalls: [],
        error: errMessage,
        raw: data,
      };
    }

    const obj = (data as Record<string, unknown>) || {};
    const choices = Array.isArray(obj.choices) ? (obj.choices as Array<Record<string, unknown>>) : [];
    const message = (choices[0]?.message as Record<string, unknown> | undefined) || {};
    const content = typeof message.content === 'string' ? message.content : '';
    const toolCalls = Array.isArray(message.tool_calls)
      ? (message.tool_calls as GeminiToolCall[])
      : [];

    const usage = (obj.usage as Record<string, unknown> | undefined) || undefined;
    const usageNormalized = usage
      ? {
          inputTokens: typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : undefined,
          outputTokens:
            typeof usage.completion_tokens === 'number' ? usage.completion_tokens : undefined,
          totalTokens: typeof usage.total_tokens === 'number' ? usage.total_tokens : undefined,
        }
      : undefined;

    return {
      ok: true,
      status: res.status,
      content,
      toolCalls,
      usage: usageNormalized,
      raw: data,
    };
  } catch (e: unknown) {
    return {
      ok: false,
      status: 0,
      content: '',
      toolCalls: [],
      error: e instanceof Error ? e.message : 'Requête Gemini échouée.',
    };
  }
}

/**
 * Petit ping conversationnel — équivalent à `pingZimaOSChatCompletion`.
 */
export async function pingGemini(opts: {
  model: string;
  apiKey?: string;
  baseUrl?: string;
  userMessage?: string;
}): Promise<{
  ok: boolean;
  status: number;
  latencyMs: number;
  preview?: string;
  error?: string;
}> {
  const t0 = Date.now();
  const r = await geminiChat({
    model: opts.model,
    apiKey: opts.apiKey,
    baseUrl: opts.baseUrl,
    maxTokens: 32,
    messages: [
      {
        role: 'user',
        content: opts.userMessage?.trim() || 'Réponds uniquement par le mot PONG.',
      },
    ],
  });
  return {
    ok: r.ok,
    status: r.status,
    latencyMs: Date.now() - t0,
    preview: r.content.slice(0, 800),
    error: r.error,
  };
}

function extractGeminiErrorMessage(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const obj = data as Record<string, unknown>;
  const errNode = obj.error;
  if (typeof errNode === 'string') return errNode;
  if (errNode && typeof errNode === 'object') {
    const e = errNode as Record<string, unknown>;
    if (typeof e.message === 'string') return e.message;
    if (typeof e.status === 'string') return String(e.status);
  }
  if (typeof obj.message === 'string') return obj.message;
  return '';
}
