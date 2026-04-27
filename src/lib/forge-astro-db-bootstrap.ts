/**
 * Volume NAS vide : SQLite sans tables → `no such table: ForgeUser`.
 * `astro db push` peut ne rien appliquer (migrations vides). On recrée les tables via
 * `scripts/forge-recreate-local-db.mjs` (hors bundle Vite : chemins internes @astrojs/db OK).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sql } from 'drizzle-orm';
import { normalizeDatabaseUrl } from '@astrojs/db/runtime';

let bootstrapGate: Promise<void> | undefined;

function resolveLocalDbFileHref(): string {
  const cwd = process.cwd();
  const envDb = process.env.ASTRO_DATABASE_FILE?.trim();
  // Aligner le bootstrap runtime avec scripts/run-astro.mjs et Dockerfile/forge.yml :
  // la base locale canonique est `.astro/content.db`.
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

/** Ajoute colonnes/tables attendues sans DROP (bases NAS déjà peuplées). */
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

/** CREATE IF NOT EXISTS depuis le schéma actuel (tables manquantes uniquement). */
function syncTablesViaNodeScript(dbHref: string): void {
  const cwd = process.cwd();
  const script = join(cwd, 'scripts', 'forge-sync-local-db.mjs');
  if (existsSync(script)) {
    execFileSync(process.execPath, [script, dbHref], { cwd, stdio: 'inherit' });
  } else {
    recreateTablesViaNodeScript(dbHref);
  }
}

/**
 * Vérifie la présence de la table ForgeUser via le client SQLite (même chemin que les scripts),
 * sans passer par `import('astro:db')` (qui peut échouer temporairement au redémarrage SSR
 * → « seed handler not loaded yet »). Sinon le bootstrap pensait la DB « cassée » et lançait
 * `forge-recreate-local-db` (DROP de toutes les tables) puis vidait les comptes.
 */
async function directSqliteForgeUserProbe(dbHref: string): Promise<'ok' | 'missing' | 'unknown'> {
  try {
    const { createClient } = await import('@astrojs/db/db-client/libsql-node.js');
    const db = createClient({ url: dbHref, token: '' });
    await db.run(sql`SELECT 1 FROM ForgeUser LIMIT 1`);
    return 'ok';
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/no such table/i.test(msg) && /ForgeUser/i.test(msg)) return 'missing';
    console.warn('[forge] Probe SQLite ForgeUser (non bloquant):', e);
    return 'unknown';
  }
}

async function runBootstrap(): Promise<void> {
  const dbHref = resolveLocalDbFileHref();
  if (!dbHref.startsWith('file:')) return;

  migrateTablesViaNodeScript(dbHref);

  const filePath = fileURLToPath(dbHref);
  try {
    mkdirSync(dirname(filePath), { recursive: true });
  } catch {
    /* ignore */
  }

  try {
    syncTablesViaNodeScript(dbHref);
  } catch (e) {
    console.warn('[forge] Échec synchronisation schéma Astro DB:', e);
  }

  let probe = await directSqliteForgeUserProbe(dbHref);
  if (probe === 'ok' || probe === 'unknown') return;

  try {
    console.warn('[forge] Table ForgeUser absente (SQLite) — recréation du schéma vers', dbHref);
    recreateTablesViaNodeScript(dbHref);
  } catch (e) {
    console.warn('[forge] Échec recréation schéma (1ʳᵉ tentative):', e);
  }

  probe = await directSqliteForgeUserProbe(dbHref);
  if (probe === 'ok' || probe === 'unknown') return;

  try {
    console.warn('[forge] ForgeUser toujours absent après recréation — nouvelle sync IF NOT EXISTS.');
    syncTablesViaNodeScript(dbHref);
  } catch (e) {
    console.error('[forge] Échec sync après recréation:', e);
  }

  probe = await directSqliteForgeUserProbe(dbHref);
  if (probe !== 'ok') {
    console.error(
      '[forge] ForgeUser toujours illisible après recréation/sync. Vérifiez ASTRO_DATABASE_FILE (build + run), ' +
        'les permissions du volume `.astro`, et que `db/config.ts` + `scripts/forge-recreate-local-db.mjs` sont présents. ' +
        'Le fichier SQLite n’est plus supprimé automatiquement pour éviter la perte de comptes.',
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
