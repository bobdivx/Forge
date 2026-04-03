/**
 * config-db.ts — Source de vérité pour tous les paramètres Forge.
 * Stocké dans la table Config d'Astro DB (clé/valeur).
 * Remplace l'ancien config.json sur le filesystem.
 */
import { db, Config } from 'astro:db';
import { eq } from 'drizzle-orm';

export type ForgeConfig = {
  openclawGatewayUrl: string;
  openclawToken: string;
  githubToken: string;
  vercelToken: string;
  forgeReposRoot: string;
  dockerYamlDir: string;
  dockerAppDataDir: string;
};

export const CONFIG_DEFAULTS: ForgeConfig = {
  openclawGatewayUrl: 'http://127.0.0.1:24190',
  openclawToken:      '',
  githubToken:        '',
  vercelToken:        '',
  forgeReposRoot:     '/media/Github',
  dockerYamlDir:      '/DATA/AppData',
  dockerAppDataDir:   '/DATA/AppData',
};

/** Lit UNE clé de la table Config. Retourne la valeur ou le défaut. */
export async function getConfig(key: keyof ForgeConfig): Promise<string> {
  try {
    const rows = await db.select().from(Config).where(eq(Config.key, key));
    if (rows.length && rows[0].value !== '') return rows[0].value;
  } catch {
    /* DB indisponible — retourne le défaut */
  }
  return CONFIG_DEFAULTS[key];
}

/** Lit TOUTES les clés connues. Toujours résolu (ne rejette jamais). */
export async function getAllConfig(): Promise<ForgeConfig> {
  const result = { ...CONFIG_DEFAULTS };
  try {
    const rows = await db.select().from(Config);
    for (const row of rows) {
      if (row.key in result && row.value !== '') {
        (result as Record<string, string>)[row.key] = row.value;
      }
    }
  } catch {
    /* DB indisponible */
  }
  return result;
}

/** Écrit une ou plusieurs clés dans la table Config (upsert). */
export async function setConfig(partial: Partial<ForgeConfig>): Promise<void> {
  for (const [key, value] of Object.entries(partial)) {
    if (!(key in CONFIG_DEFAULTS)) continue;
    const val = String(value ?? '');
    try {
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
