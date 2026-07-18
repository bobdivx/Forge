/**
 * URL de base du dashboard Forge pour construire `/api/forge-hook`, prompts d’audit, etc.
 *
 * Priorité :
 * 1. FORGE_HOOK_BASE_URL (override explicite CI / compose)
 * 2. forgePublicUrl — table Config (Paramètres → éditable sans toucher Docker)
 * 3. PUBLIC_FORGE_URL / PUBLIC_SITE_URL (.env Astro)
 * 4. défaut localhost
 */
import { getConfig } from './config-db';

export async function getForgeHookBaseUrl(): Promise<string> {
  const env =
    process.env.FORGE_HOOK_BASE_URL?.trim() ||
    process.env.PUBLIC_FORGE_URL?.trim() ||
    process.env.PUBLIC_SITE_URL?.trim();
  if (env) return env.replace(/\/$/, '');

  const fromDb = (await getConfig('forgePublicUrl')).trim();
  if (fromDb) return fromDb.replace(/\/$/, '');

  return 'http://127.0.0.1:4321';
}
