/**
 * Disponibilité réelle des modèles Gemini : la liste `/models` n’indique pas
 * si un modèle accepte encore du trafic (quota, deprecation, erreurs provisioning).
 *
 * On sonde avec un mini `chat/completions` (`pingGemini`) et on met en cache
 * le résultat pour éviter de saturer l’API à chaque sélecteur UI.
 */
import {
  fetchGeminiAvailableModels,
  getGeminiConfig,
  pingGemini,
} from './gemini-provider';

export type FunctionalGeminiModel = { id: string; label: string };

type CacheEntry = { configKey: string; expiresAt: number; payload: FunctionalGeminiModel[] };
let functionalCache: CacheEntry | null = null;

const FUNCTIONAL_CACHE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_MAX_PROBE = 16;
const PING_CONCURRENCY = 3;

function geminiCacheConfigKey(apiKey: string, baseUrl: string): string {
  return `${String(apiKey || '').trim()}|${String(baseUrl || '').trim().toLowerCase()}`;
}

/** Invalide le cache des modèles Gemini « réellement utilisables ». */
export function invalidateFunctionalGeminiModelsCache(): void {
  functionalCache = null;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) break;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Modèles Gemini qui répondent OK à un ping léger (`max_tokens` court).
 *
 * En cas de liste vide alors que l’API `/models` renvoie des IDs, tous les pings
 * ont échoué (quota globale 429, clé résolue mais chat bloqué, etc.).
 */
export async function getFunctionalGeminiModels(opts?: {
  force?: boolean;
  maxProbe?: number;
}): Promise<{ ok: boolean; models: FunctionalGeminiModel[]; error?: string }> {
  const cfg = await getGeminiConfig();
  if (!cfg.enabled || !cfg.apiKey) {
    return { ok: true, models: [] };
  }

  const configKey = geminiCacheConfigKey(cfg.apiKey, cfg.baseUrl);
  if (
    !opts?.force &&
    functionalCache &&
    functionalCache.configKey === configKey &&
    functionalCache.expiresAt > Date.now()
  ) {
    return { ok: true, models: functionalCache.payload };
  }

  const listed = await fetchGeminiAvailableModels({
    apiKey: cfg.apiKey,
    baseUrl: cfg.baseUrl,
    force: opts?.force,
  });
  if (!listed.ok) {
    return { ok: false, models: [], error: listed.error || `HTTP ${listed.status}` };
  }

  const max = Math.max(
    1,
    Math.min(Number(opts?.maxProbe ?? DEFAULT_MAX_PROBE) || DEFAULT_MAX_PROBE, listed.models.length),
  );
  const candidates = listed.models.slice(0, max);

  const results = await mapWithConcurrency(candidates, PING_CONCURRENCY, async (m) => {
    const ping = await pingGemini({
      model: m.id,
      apiKey: cfg.apiKey,
      baseUrl: cfg.baseUrl,
      userMessage: 'Réponds uniquement par le mot PONG.',
    });
    return ping.ok ? ({ id: m.id, label: m.label || m.id } satisfies FunctionalGeminiModel) : null;
  });

  const functional = results.filter((x): x is FunctionalGeminiModel => x != null);

  functionalCache = {
    configKey,
    expiresAt: Date.now() + FUNCTIONAL_CACHE_TTL_MS,
    payload: functional,
  };

  return { ok: true, models: functional };
}

/** True pour erreurs généralement transitoires côté provider / quota / réseau client. */
export function isRetriableGeminiHttpStatus(status: number): boolean {
  return (
    status === 0 ||
    status === 408 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
}
