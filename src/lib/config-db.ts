/**
 * Paramètres Forge dans la table Config d’Astro DB (clé/valeur).
 * La clé interne `sessionSecret` n’est jamais exposée au client.
 */
import { eq } from 'drizzle-orm';
import { loadAstroDb } from './load-astro-db';

export type ForgeConfig = {
  openclawGatewayUrl: string;
  openclawToken: string;
  githubToken: string;
  vercelToken: string;
  /** Secret HMAC du webhook GitHub (PR Jules) — même valeur que dans les réglages du dépôt GitHub. */
  githubWebhookSecret: string;
  forgeReposRoot: string;
  dockerYamlDir: string;
  dockerAppDataDir: string;
  /**
   * Assistant premier lancement : `pending` → redirection /setup.
   * `done` / `skipped` → plus d’assistant. Défaut `done` si absent en base (installations existantes).
   */
  forgeSetupState: string;
};

export const CONFIG_DEFAULTS: ForgeConfig = {
  openclawGatewayUrl: 'http://127.0.0.1:24190',
  openclawToken: '',
  githubToken: '',
  vercelToken: '',
  githubWebhookSecret: '',
  forgeReposRoot: '/mnt/GitHub',
  dockerYamlDir: '/DATA/AppData',
  dockerAppDataDir: '/DATA/AppData',
  forgeSetupState: 'done',
};

const INTERNAL_CONFIG_KEYS = new Set(['sessionSecret']);

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
