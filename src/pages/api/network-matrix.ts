import type { APIRoute } from 'astro';
import { getConfig, getOllamaOriginResolved } from '../../lib/config-db';
import { getForgeHookBaseUrl } from '../../lib/forge-hook-base-url';
import {
  getZimaOSGatewayBaseUrl,
  getZimaOSGatewayCandidateBases,
  getZimaOSClientDebugMeta,
  fetchZimaOSJson,
} from '../../lib/zimaos-gateway';

type ValueSource = 'env' | 'database' | 'fallback';

function trim(v: string | undefined): string {
  return String(v || '').trim();
}

function normalizeUrl(value: string): string {
  return value.replace(/\/$/, '');
}

function detectForgeSource(envValue: string, dbValue: string, resolved: string): ValueSource {
  if (envValue && normalizeUrl(envValue) === normalizeUrl(resolved)) return 'env';
  if (dbValue && normalizeUrl(dbValue) === normalizeUrl(resolved)) return 'database';
  return 'fallback';
}

function detectOllamaSource(envHost: string, envOrigin: string, dbValue: string, resolved: string): ValueSource {
  if (dbValue && normalizeUrl(dbValue) === normalizeUrl(resolved)) return 'database';
  if ((envHost && normalizeUrl(envHost) === normalizeUrl(resolved)) || (envOrigin && normalizeUrl(envOrigin) === normalizeUrl(resolved))) {
    return 'env';
  }
  return 'fallback';
}

export const GET: APIRoute = async () => {
  try {
    const forgeEnv = trim(process.env.FORGE_HOOK_BASE_URL) || trim(process.env.PUBLIC_FORGE_URL) || trim(process.env.PUBLIC_SITE_URL);
    const forgeDb = trim(await getConfig('forgePublicUrl'));
    const forgeResolved = normalizeUrl(await getForgeHookBaseUrl());

    const zimaosMeta = await getZimaOSClientDebugMeta();
    const zimaosResolved = normalizeUrl(await getZimaOSGatewayBaseUrl());
    const zimaosCandidates = await getZimaOSGatewayCandidateBases();
    const zimaosDb = trim((await getConfig('zimaosRuntimeUrl')) || (await getConfig('zimaosGatewayUrl')));
    const zimaosEnv = trim(process.env.FORGE_ZIMAOS_RUNTIME_URL) || trim(process.env.ZIMAOS_GATEWAY_URL);

    const ollamaDb = trim(await getConfig('ollamaUrl'));
    const ollamaEnvHost = trim(process.env.OLLAMA_HOST);
    const ollamaEnvOrigin = trim(process.env.OLLAMA_ORIGIN);
    const ollamaResolved = normalizeUrl(await getOllamaOriginResolved());
    const probeForge = await fetch(`${forgeResolved}/login`, {
      method: 'GET',
      signal: AbortSignal.timeout(1500),
    })
      .then((r) => ({ ok: r.ok, status: r.status }))
      .catch((e: unknown) => ({ ok: false, status: 0, error: e instanceof Error ? e.message : 'Erreur réseau' }));
    const probeZimaosRaw = await fetchZimaOSJson(undefined, '/health');
    const probeZimaos = {
      ok: probeZimaosRaw.ok,
      status: probeZimaosRaw.status,
      error: probeZimaosRaw.ok ? undefined : probeZimaosRaw.error,
    };
    const probeOllama = ollamaResolved
      ? await fetch(`${ollamaResolved}/api/tags`, {
          method: 'GET',
          signal: AbortSignal.timeout(1500),
        })
          .then((r) => ({ ok: r.ok, status: r.status }))
          .catch((e: unknown) => ({
            ok: false,
            status: 0,
            error: e instanceof Error ? e.message : 'Erreur réseau',
          }))
      : { ok: false, status: 0, error: 'URL Ollama non configurée' };

    const payload = {
      forge: {
        resolvedBaseUrl: forgeResolved,
        source: detectForgeSource(forgeEnv, forgeDb, forgeResolved),
        envValue: forgeEnv || null,
        dbValue: forgeDb || null,
        endpoints: {
          hook: `${forgeResolved}/api/forge-hook`,
          api: `${forgeResolved}/api`,
        },
      },
      zimaosRuntime: {
        resolvedBaseUrl: zimaosResolved,
        source: zimaosMeta.urlSource,
        envValue: zimaosEnv || null,
        dbValue: zimaosDb || null,
        candidates: zimaosCandidates,
        tokenConfigured: zimaosMeta.tokenConfigured,
        tokenSource: zimaosMeta.tokenSource,
      },
      ollama: {
        resolvedBaseUrl: ollamaResolved || null,
        source: detectOllamaSource(ollamaEnvHost, ollamaEnvOrigin, ollamaDb, ollamaResolved),
        envHost: ollamaEnvHost || null,
        envOrigin: ollamaEnvOrigin || null,
        dbValue: ollamaDb || null,
        endpointTags: ollamaResolved ? `${ollamaResolved}/api/tags` : null,
      },
      conventions: {
        forge: {
          internalPort: 4321,
          nasPublishedPortTypical: 4331,
        },
        zimaosRuntime: {
          internalPort: 18789,
          nasPublishedPortTypical: 24190,
        },
        note: 'Les URLs sont resolues depuis le process Forge (serveur), pas depuis le navigateur.',
      },
      probes: {
        forgeLogin: probeForge,
        zimaosHealth: probeZimaos,
        ollamaTags: probeOllama,
      },
      timestamp: new Date().toISOString(),
    };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
