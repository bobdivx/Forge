import { eq, like } from 'drizzle-orm';
import { getOllamaOriginResolved } from './config-db';
import { loadAstroDb } from './load-astro-db';

export type OllamaModelCompatibility = {
  ok?: boolean;
  disabledManually?: boolean;
};

export type SelectableOllamaModel = {
  name: string;
  origin: string;
  compatibility?: OllamaModelCompatibility;
};

function normalizeOllamaBase(raw: string): string {
  const value = String(raw || '').trim();
  if (!value) return '';
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `http://${value}`;
  try {
    const parsed = new URL(withProtocol.replace(/\/v1$/i, '').replace(/\/api$/i, ''));
    if (parsed.hostname === '0.0.0.0') parsed.hostname = '127.0.0.1';
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return withProtocol.replace(/\/+$/, '').replace(/\/v1$/i, '').replace(/\/api$/i, '');
  }
}

function isSelectableCompatibility(compatibility?: OllamaModelCompatibility): boolean {
  if (!compatibility) return true;
  if (compatibility.disabledManually) return false;
  if (compatibility.ok === false) return false;
  return true;
}

async function readCompatibility(): Promise<Record<string, OllamaModelCompatibility>> {
  try {
    const { db, Config } = await loadAstroDb();
    const rows = await db.select().from(Config).where(like(Config.key, 'compatibility_ollama_%'));
    const compatibility: Record<string, OllamaModelCompatibility> = {};
    for (const row of rows) {
      const modelName = String(row.key || '').replace('compatibility_ollama_', '');
      if (!modelName) continue;
      try {
        compatibility[modelName] = JSON.parse(String(row.value || '{}'));
      } catch {
        compatibility[modelName] = { ok: false };
      }
    }
    return compatibility;
  } catch {
    return {};
  }
}

async function readEnabledOrigins(): Promise<string[]> {
  const origins: string[] = [];
  try {
    const { db, OllamaInstance } = await loadAstroDb();
    if (OllamaInstance) {
      const rows = await db.select().from(OllamaInstance).where(eq(OllamaInstance.enabled, 1));
      for (const row of rows) {
        const origin = normalizeOllamaBase(String(row.url || ''));
        if (origin && !origins.includes(origin)) origins.push(origin);
      }
    }
  } catch {
    // Fallback below.
  }

  if (origins.length === 0) {
    const fallback = normalizeOllamaBase(await getOllamaOriginResolved());
    if (fallback) origins.push(fallback);
  }
  return origins;
}

async function fetchModelNames(origin: string): Promise<string[]> {
  const readTags = async (url: string) => {
    const res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return [];
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const models = Array.isArray(data.models) ? (data.models as Array<Record<string, unknown>>) : [];
    return models.map((m) => String(m.name || m.model || m.id || '').trim()).filter(Boolean);
  };

  const base = normalizeOllamaBase(origin);
  const fromTags = await readTags(`${base}/api/tags`).catch(() => []);
  if (fromTags.length > 0) return fromTags;

  const fromV1 = await fetch(`${base}/v1/models`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(3_000),
  })
    .then(async (res) => {
      if (!res.ok) return [];
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const rows = Array.isArray(data.data)
        ? (data.data as Array<Record<string, unknown>>)
        : Array.isArray(data.models)
          ? (data.models as Array<Record<string, unknown>>)
          : [];
      return rows.map((m) => String(m.name || m.model || m.id || '').trim()).filter(Boolean);
    })
    .catch(() => []);

  return fromV1;
}

export async function getSelectableOllamaModels(): Promise<SelectableOllamaModel[]> {
  const [origins, compatibility] = await Promise.all([readEnabledOrigins(), readCompatibility()]);
  const byName = new Map<string, SelectableOllamaModel>();

  await Promise.all(
    origins.map(async (origin) => {
      const names = await fetchModelNames(origin);
      for (const name of names) {
        const c = compatibility[name];
        if (!isSelectableCompatibility(c)) continue;
        const key = name.toLowerCase();
        if (!byName.has(key)) {
          byName.set(key, { name, origin: normalizeOllamaBase(origin), compatibility: c });
        }
      }
    }),
  );

  return [...byName.values()];
}

