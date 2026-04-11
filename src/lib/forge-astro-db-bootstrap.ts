/**
 * Volume NAS vide sur `.astro` : SQLite sans tables → `no such table: ForgeUser`.
 * Un `astro db push` sur le même fichier que `ASTRO_DATABASE_FILE` (défaut : `.astro/content.db`).
 * Si le snapshot dit « à jour » mais les tables manquent, on supprime le fichier et on repousse une fois.
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

  const cwd = process.cwd();
  const astroBin = join(cwd, 'node_modules', 'astro', 'bin', 'astro.mjs');
  if (!existsSync(astroBin)) {
    console.error('[forge] Astro CLI introuvable — impossible d’appliquer le schéma DB.');
    return;
  }

  if (await forgeUserVisibleViaAstroDb()) return;

  const filePath = fileURLToPath(dbHref);
  try {
    mkdirSync(dirname(filePath), { recursive: true });
  } catch {
    /* ignore */
  }

  console.warn('[forge] Schéma Astro DB absent — « astro db push » vers', dbHref);
  runAstroDbPush(cwd, astroBin, dbHref);

  if (await forgeUserVisibleViaAstroDb()) return;

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

  console.warn('[forge] Nouvelle tentative « astro db push » après réinitialisation du fichier.');
  runAstroDbPush(cwd, astroBin, dbHref);

  if (!(await forgeUserVisibleViaAstroDb())) {
    console.error(
      '[forge] ForgeUser toujours absent. Définissez ASTRO_DATABASE_FILE au **build** et au **run** ' +
        '(ex. file:/app/.astro/content.db) puis reconstruisez l’image.',
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
