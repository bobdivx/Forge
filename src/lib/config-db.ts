/**
 * Paramètres Forge dans la table Config d’Astro DB (clé/valeur).
 * La clé interne `sessionSecret` n’est jamais exposée au client.
 */
import { eq } from 'drizzle-orm';
import { loadAstroDb } from './load-astro-db';

export type ForgeConfig = {
  /**
   * URL joignable **depuis les autres services** (OpenClaw Docker, cron, agents) pour appeler Forge.
   * Ex. `http://forge-host:4321` ou `http://forge:4321`. Laissé vide → fallback env / défaut localhost.
   */
  forgePublicUrl: string;
  /** Nom du contèneur Docker OpenClaw pour docker inspect/exec (vide = auto-détection name=openclaw). */
  openclawContainerName: string;
  openclawGatewayUrl: string;
  openclawToken: string;
  /** URL de l’API Ollama (GET /api/tags), ex. http://host.docker.internal:11434 — même rôle que OLLAMA_HOST. */
  ollamaUrl: string;
  githubToken: string;
  vercelToken: string;
  /** Secret HMAC du webhook GitHub (PR Jules) — même valeur que dans les réglages du dépôt GitHub. */
  githubWebhookSecret: string;
  forgeReposRoot: string;
  dockerYamlDir: string;
  dockerAppDataDir: string;
  /** Racine des projets telle que vue par les agents sur le NAS (ex: /mnt/GitHub). */
  forgeReposRootAgent: string;
  /**
   * Assistant premier lancement : `pending` → redirection /setup.
   * `done` / `skipped` → plus d’assistant. Défaut `done` si absent en base (installations existantes).
   */
  forgeSetupState: string;
};

/** Valeurs neutres si aucune ligne Config en base (pas de chemins ou URLs « maison » codés en dur). */
export const CONFIG_DEFAULTS: ForgeConfig = {
  forgePublicUrl: '',
  openclawContainerName: '',
  openclawGatewayUrl: '',
  openclawToken: '',
  ollamaUrl: '',
  githubToken: '',
  vercelToken: '',
  githubWebhookSecret: '',
  forgeReposRoot: '',
  dockerYamlDir: '',
  dockerAppDataDir: '',
  forgeReposRootAgent: '',
  forgeSetupState: 'done',
};

const INTERNAL_CONFIG_KEYS = new Set(['sessionSecret']);

/**
 * Origine HTTP pour l’API Ollama (`GET …/api/tags`).
 * Ordre : Paramètres (`ollamaUrl`) → `OLLAMA_HOST` → `OLLAMA_ORIGIN` → localhost en dev uniquement.
 */
export async function getOllamaOriginResolved(): Promise<string> {
  const fromDb = (await getConfig('ollamaUrl')).trim();
  return (
    fromDb ||
    process.env.OLLAMA_HOST?.trim() ||
    process.env.OLLAMA_ORIGIN?.trim() ||
    (process.env.NODE_ENV !== 'production' ? 'http://127.0.0.1:11434' : '')
  );
}

export async function getConfig(key: keyof ForgeConfig): Promise<string> {
  try {
    const { db, Config } = await loadAstroDb();
    const rows = await db.select().from(Config).where(eq(Config.key, key));
    if (rows.length && rows[0].value !== '') return rows[0].value;
  } catch {
    /* DB indisponible */
  }
  return CONFIG_DEFAULTS[key];
}

/** Toutes les clés « métier » (pas les clés internes comme sessionSecret). */
export async function getAllConfig(): Promise<ForgeConfig> {
  const result = { ...CONFIG_DEFAULTS };
  try {
    const { db, Config } = await loadAstroDb();
    const rows = await db.select().from(Config);
    for (const row of rows) {
      if (INTERNAL_CONFIG_KEYS.has(row.key)) continue;
      if (row.key in result && row.value !== '') {
        (result as Record<string, string>)[row.key] = row.value;
      }
    }
  } catch {
    /* DB indisponible */
  }
  return result;
}

export async function setConfig(partial: Partial<ForgeConfig>): Promise<void> {
  for (const [key, value] of Object.entries(partial)) {
    if (!(key in CONFIG_DEFAULTS)) continue;
    if (INTERNAL_CONFIG_KEYS.has(key)) continue;
    const val = String(value ?? '');
    try {
      const { db, Config } = await loadAstroDb();
      const existing = await db.select().from(Config).where(eq(Config.key, key));
      if (existing.length) {
        await db.update(Config).set({ value: val, updatedAt: new Date() }).where(eq(Config.key, key));
      } else {
        await db.insert(Config).values({ key, value: val, updatedAt: new Date() });
      }
    } catch (e) {
      console.error(`setConfig(${key}) failed:`, e);
    }
  }
}
