/**
 * Ajoute les colonnes manquantes sur une SQLite Astro DB locale (schéma étendu après coup).
 * Idempotent : ignore « duplicate column ».
 *
 * Usage :
 *   node scripts/migrate-astro-db-columns.mjs
 *   node scripts/migrate-astro-db-columns.mjs file:///chemin/vers/content.db
 *
 * Sans argument : ASTRO_DATABASE_FILE ou .astro/content.db à la racine du repo.
 */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import { sql } from 'drizzle-orm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Paires [table SQLite, colonne, type SQL] alignées sur db/config.ts */
export const COLUMN_MIGRATIONS = [['Request', 'assigneeAgentId', 'TEXT']];

export function resolveDbUrlForMigrate(argvOverride = process.argv[2]?.trim()) {
  if (argvOverride?.startsWith('file:')) return argvOverride;
  const env = process.env.ASTRO_DATABASE_FILE?.trim();
  if (env) {
    if (env.startsWith('file:')) return env;
    return `file:${resolve(root, env)}`;
  }
  return `file:${join(root, '.astro', 'content.db')}`;
}

/**
 * @param db client `@libsql/client` (`execute`) ou Drizzle libSQL (`run` + sql.raw)
 */
export async function migrateAstroDbColumns(db) {
  for (const [table, column, sqlType] of COLUMN_MIGRATIONS) {
    const rawSql = `ALTER TABLE "${table}" ADD COLUMN "${column}" ${sqlType}`;
    try {
      if (typeof db.run === 'function') {
        await db.run(sql.raw(rawSql));
      } else {
        await db.execute(rawSql);
      }
      console.log(`[migrate-astro-db-columns] OK + colonne ${table}.${column}`);
    } catch (e) {
      const msg = String(e?.message ?? e);
      if (/duplicate column/i.test(msg) || /already exists/i.test(msg)) {
        continue;
      }
      if (/no such table/i.test(msg)) {
        console.warn(`[migrate-astro-db-columns] Table "${table}" absente — ignoré.`);
        continue;
      }
      throw e;
    }
  }
}

async function mainCli() {
  const url = resolveDbUrlForMigrate();
  const pathPart = url.replace(/^file:/, '');
  if (!existsSync(pathPart)) {
    console.warn('[migrate-astro-db-columns] Fichier absent, rien à faire :', pathPart);
    process.exit(0);
  }

  const db = createClient({ url });
  try {
    await migrateAstroDbColumns(db);
    console.log('[migrate-astro-db-columns] Terminé pour', url);
  } finally {
    db.close();
  }
}

const ranAsCli =
  typeof process.argv[1] === 'string' &&
  process.argv[1].replace(/\\/g, '/').includes('/migrate-astro-db-columns.mjs');
if (ranAsCli) {
  await mainCli();
}
