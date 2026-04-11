/**
 * Sur Docker / NAS, un volume vide monté sur `.astro` fournit un SQLite sans schéma :
 * `no such table: ForgeUser`. Les tables sont normalement créées au `astro build` sur le
 * fichier de build, pas au runtime. On applique ici `astro db push` une fois si besoin.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { normalizeDatabaseUrl } from '@astrojs/db/runtime';

let bootstrapGate: Promise<void> | undefined;

function resolveLocalDbFileHref(): string {
  const cwd = process.cwd();
  const envDb = process.env.ASTRO_DATABASE_FILE?.trim();
  const defaultHref = pathToFileURL(join(cwd, '.astro', 'content.db')).href;
  return normalizeDatabaseUrl(envDb || '', defaultHref);
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

async function runBootstrap(): Promise<void> {
  if (process.env.FORGE_SKIP_ASTRO_DB_BOOTSTRAP === '1') return;

  const dbHref = resolveLocalDbFileHref();
  if (!dbHref.startsWith('file:')) {
    /* Turso / distant : schéma géré hors conteneur */
    return;
  }

  const filePath = fileURLToPath(dbHref);
  try {
    mkdirSync(dirname(filePath), { recursive: true });
  } catch {
    /* ignore */
  }

  if (await forgeHasForgeUserTable(dbHref)) return;

  const cwd = process.cwd();
  const astroBin = join(cwd, 'node_modules', 'astro', 'bin', 'astro.mjs');
  if (!existsSync(astroBin)) {
    console.error('[forge] Astro CLI introuvable (', astroBin, ') — impossible d’appliquer le schéma DB.');
    return;
  }

  const pushUrl = dbHref;
  console.warn(
    '[forge] Schéma Astro DB absent (table ForgeUser). Exécution de « astro db push » vers',
    pushUrl,
  );

  execFileSync(process.execPath, [astroBin, 'db', 'push'], {
    cwd,
    stdio: 'inherit',
    env: {
      ...process.env,
      /** `astro db push` lit surtout ASTRO_DB_REMOTE_URL (fichier local accepté). */
      ASTRO_DB_REMOTE_URL: pushUrl,
    },
  });
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
