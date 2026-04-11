/**
 * Sur Docker / NAS, un volume vide monté sur `.astro` fournit un SQLite sans schéma :
 * `no such table: ForgeUser`. Les tables sont normalement créées au `astro build` sur le
 * fichier de build, pas au runtime. On applique ici `astro db push` une fois si besoin.
 *
 * Piège fréquent : `ASTRO_DATABASE_FILE` au runtime pointe vers `db.sqlite` alors que le
 * bundle `astro:db` a été construit avec la cible par défaut `.astro/content.db` — deux
 * fichiers distincts. On tente donc **plusieurs chemins locaux** et on réinitialise un
 * fichier SQLite incohérent (snapshot « à jour » mais tables absentes).
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

/** Tous les emplacements plausibles pour un SQLite Astro DB local (évite db.sqlite vs content.db). */
function collectLocalDbFileHrefs(): string[] {
  const cwd = process.cwd();
  const primary = resolveLocalDbFileHref();
  const extras = [
    pathToFileURL(join(cwd, '.astro', 'content.db')).href,
    pathToFileURL(join(cwd, '.astro', 'db.sqlite')).href,
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const h of [primary, ...extras]) {
    if (!h.startsWith('file:')) continue;
    const key = h.replace(/\/+$/, '').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(h);
  }
  return out;
}

async function forgeHasForgeUserTable(dbHref: string): Promise<boolean> {
  const { createClient } = await import('@libsql/client');
  const client = createClient({ url: dbHref });
  try {
    const r = await client.execute(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='ForgeUser' LIMIT 1",
    );
    return Boolean(r.rows?.length);
  } catch {
    return false;
  } finally {
    try {
      client.close();
    } catch {
      /* ignore */
    }
  }
}

function runAstroDbPush(cwd: string, astroBin: string, pushUrl: string): void {
  execFileSync(process.execPath, [astroBin, 'db', 'push'], {
    cwd,
    stdio: 'inherit',
    env: {
      ...process.env,
      ASTRO_DB_REMOTE_URL: pushUrl,
    },
  });
}

/** True si `astro:db` peut interroger ForgeUser (cible réelle du serveur). */
async function forgeUserVisibleViaAstroDb(): Promise<boolean> {
  try {
    const { db, ForgeUser } = await loadAstroDb();
    await db.select().from(ForgeUser).limit(1);
    return true;
  } catch {
    return false;
  }
}

async function ensureOneLocalFileHasSchema(
  cwd: string,
  astroBin: string,
  dbHref: string,
): Promise<void> {
  if (!dbHref.startsWith('file:')) return;

  const filePath = fileURLToPath(dbHref);
  try {
    mkdirSync(dirname(filePath), { recursive: true });
  } catch {
    /* ignore */
  }

  if (await forgeHasForgeUserTable(dbHref)) return;

  console.warn(
    '[forge] Schéma Astro DB absent (table ForgeUser). Exécution de « astro db push » vers',
    dbHref,
  );
  runAstroDbPush(cwd, astroBin, dbHref);

  if (await forgeHasForgeUserTable(dbHref)) return;

  /* Snapshot _astro_db_snapshot « à jour » mais tables manquantes : repartir de zéro sur ce fichier. */
  try {
    if (existsSync(filePath)) unlinkSync(filePath);
  } catch (e) {
    console.warn('[forge] Impossible de supprimer le SQLite incohérent:', filePath, e);
  }
  try {
    mkdirSync(dirname(filePath), { recursive: true });
  } catch {
    /* ignore */
  }

  console.warn('[forge] Nouvelle tentative « astro db push » après réinitialisation de', dbHref);
  runAstroDbPush(cwd, astroBin, dbHref);
}

async function runBootstrap(): Promise<void> {
  if (process.env.FORGE_SKIP_ASTRO_DB_BOOTSTRAP === '1') return;

  const primary = resolveLocalDbFileHref();
  if (!primary.startsWith('file:')) {
    /* Turso / distant : schéma géré hors conteneur */
    return;
  }

  const cwd = process.cwd();
  const astroBin = join(cwd, 'node_modules', 'astro', 'bin', 'astro.mjs');
  if (!existsSync(astroBin)) {
    console.error('[forge] Astro CLI introuvable (', astroBin, ') — impossible d’appliquer le schéma DB.');
    return;
  }

  if (await forgeUserVisibleViaAstroDb()) return;

  const hrefs = collectLocalDbFileHrefs();
  for (const href of hrefs) {
    await ensureOneLocalFileHasSchema(cwd, astroBin, href);
  }

  if (await forgeUserVisibleViaAstroDb()) return;

  console.error(
    '[forge] Après « astro db push », la table ForgeUser reste inaccessible via astro:db. ' +
      'Vérifiez que le **build** Docker utilise le même ASTRO_DATABASE_FILE qu’au runtime ' +
      '(ex. `file:/app/.astro/content.db` partout), puis reconstruisez l’image.',
  );
}

/** À appeler une fois au démarrage des requêtes (ex. middleware). */
export function ensureAstroLocalDbSchemaOnce(): Promise<void> {
  if (process.env.FORGE_SKIP_ASTRO_DB_BOOTSTRAP === '1') return Promise.resolve();
  if (!bootstrapGate) {
    bootstrapGate = runBootstrap().catch((e) => {
      bootstrapGate = undefined;
      throw e;
    });
  }
  return bootstrapGate;
}
