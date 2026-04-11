/**
 * Volume NAS vide : SQLite sans tables → `no such table: ForgeUser`.
 * `astro db push` peut ne rien appliquer (migrations vides si `_astro_db_snapshot` prétend « à jour »).
 * On recrée donc les tables comme le plugin Vite au build (`recreateTables`).
 */
import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sql } from 'drizzle-orm';
import { SQLiteAsyncDialect } from 'drizzle-orm/sqlite-core';
import { createClient } from '@astrojs/db/dist/core/db-client/libsql-node.js';
import { getCreateIndexQueries, getCreateTableQuery } from '@astrojs/db/dist/core/queries.js';
import { resolveDbConfig } from '@astrojs/db/dist/core/load-file.js';
import { normalizeDatabaseUrl } from '@astrojs/db/runtime';
import { loadAstroDb } from './load-astro-db';

let bootstrapGate: Promise<void> | undefined;

const sqlite = new SQLiteAsyncDialect();

function resolveLocalDbFileHref(): string {
  const cwd = process.cwd();
  const envDb = process.env.ASTRO_DATABASE_FILE?.trim();
  const defaultHref = pathToFileURL(join(cwd, '.astro', 'content.db')).href;
  return normalizeDatabaseUrl(envDb || '', defaultHref);
}

function projectRootUrl(): URL {
  const base = pathToFileURL(join(process.cwd(), sep === '\\' ? '\\' : '/'));
  return new URL('.', base);
}

/** Recrée toutes les tables décrites dans `db/config.ts` (ordre : DROP IF EXISTS puis CREATE + index). */
async function recreateAllTablesFromDbConfig(dbHref: string): Promise<void> {
  const { dbConfig } = await resolveDbConfig({
    root: projectRootUrl(),
    integrations: [],
  });
  const tables = dbConfig.tables ?? {};
  const db = createClient({ url: dbHref });
  const setupQueries = [];
  for (const [name, table] of Object.entries(tables)) {
    setupQueries.push(sql.raw(`DROP TABLE IF EXISTS ${sqlite.escapeName(name)}`));
    setupQueries.push(sql.raw(getCreateTableQuery(name, table)));
    for (const idx of getCreateIndexQueries(name, table)) {
      setupQueries.push(sql.raw(idx));
    }
  }
  await db.batch([db.run(sql`pragma defer_foreign_keys=true;`), ...setupQueries.map((q) => db.run(q))]);
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

  if (await forgeUserVisibleViaAstroDb()) return;

  const filePath = fileURLToPath(dbHref);
  try {
    mkdirSync(dirname(filePath), { recursive: true });
  } catch {
    /* ignore */
  }

  try {
    console.warn('[forge] Schéma Astro DB absent — recréation des tables vers', dbHref);
    await recreateAllTablesFromDbConfig(dbHref);
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
    await recreateAllTablesFromDbConfig(dbHref);
  } catch (e) {
    console.error('[forge] Échec recréation schéma (2ᵉ tentative):', e);
  }

  if (!(await forgeUserVisibleViaAstroDb())) {
    console.error(
      '[forge] ForgeUser toujours absent après recréation. Vérifiez ASTRO_DATABASE_FILE (build + run) ' +
        'et que `db/config.ts` est présent dans l’image.',
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
