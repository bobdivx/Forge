/**
 * Volume NAS vide : SQLite sans tables → `no such table: ForgeUser`.
 * `astro db push` peut ne rien appliquer (migrations vides). On recrée les tables via
 * `scripts/forge-recreate-local-db.mjs` (hors bundle Vite : chemins internes @astrojs/db OK).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { normalizeDatabaseUrl } from '@astrojs/db/runtime';
import { loadAstroDb } from './load-astro-db';

let bootstrapGate: Promise<void> | undefined;

function resolveLocalDbFileHref(): string {
  const cwd = process.cwd();
  const envDb = process.env.ASTRO_DATABASE_FILE?.trim();
  const defaultHref = pathToFileURL(join(cwd, '.astro', 'content.db')).href;
  return normalizeDatabaseUrl(envDb || '', defaultHref);
}

function recreateTablesViaNodeScript(dbHref: string): void {
  const cwd = process.cwd();
  const script = join(cwd, 'scripts', 'forge-recreate-local-db.mjs');
  if (!existsSync(script)) {
    throw new Error(`Script introuvable: ${script}`);
  }
  execFileSync(process.execPath, [script, dbHref], { cwd, stdio: 'inherit' });
}

/** Colonnes additives sur une base SQLite déjà peuplée (NAS) pour suivre le schéma du code. */
function migrateTablesViaNodeScript(dbHref: string): void {
  const cwd = process.cwd();
  const script = join(cwd, 'scripts', 'forge-migrate-local-db.mjs');
  if (!existsSync(script)) {
    console.warn('[forge] Script migrations absent:', script);
    return;
  }
  try {
    execFileSync(process.execPath, [script, dbHref], { cwd, stdio: 'inherit' });
  } catch (e) {
    console.warn('[forge] forge-migrate-local-db (non bloquant):', e);
  }
}

async function forgeUserVisibleViaAstroDb(): Promise<boolean> {
  try {
    const { db, ForgeUser } = await loadAstroDb();
    await db.select().from(ForgeUser).limit(1);
    return true;
  } catch {
    return false;
  }
}

async function runBootstrap(): Promise<void> {
  const dbHref = resolveLocalDbFileHref();
  if (!dbHref.startsWith('file:')) return;

  migrateTablesViaNodeScript(dbHref);

  if (await forgeUserVisibleViaAstroDb()) return;

  const filePath = fileURLToPath(dbHref);
  try {
    mkdirSync(dirname(filePath), { recursive: true });
  } catch {
    /* ignore */
  }

  try {
    console.warn('[forge] Schéma Astro DB absent — recréation des tables vers', dbHref);
    recreateTablesViaNodeScript(dbHref);
  } catch (e) {
    console.warn('[forge] Échec recréation schéma (1ʳᵉ tentative):', e);
  }

  if (await forgeUserVisibleViaAstroDb()) return;

  try {
    if (existsSync(filePath)) unlinkSync(filePath);
  } catch (e) {
    console.warn('[forge] Impossible de supprimer le SQLite:', filePath, e);
  }
  try {
    mkdirSync(dirname(filePath), { recursive: true });
  } catch {
    /* ignore */
  }

  try {
    console.warn('[forge] Nouvelle recréation des tables après réinitialisation du fichier.');
    recreateTablesViaNodeScript(dbHref);
  } catch (e) {
    console.error('[forge] Échec recréation schéma (2ᵉ tentative):', e);
  }

  if (!(await forgeUserVisibleViaAstroDb())) {
    console.error(
      '[forge] ForgeUser toujours absent après recréation. Vérifiez ASTRO_DATABASE_FILE (build + run) ' +
        'et que `db/config.ts` + `scripts/forge-recreate-local-db.mjs` sont présents dans l’image.',
    );
  }
}

export function ensureAstroLocalDbSchemaOnce(): Promise<void> {
  if (!bootstrapGate) {
    bootstrapGate = runBootstrap().catch((e) => {
      bootstrapGate = undefined;
      throw e;
    });
  }
  return bootstrapGate;
}
